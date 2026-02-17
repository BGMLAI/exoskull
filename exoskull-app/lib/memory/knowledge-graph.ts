/**
 * Knowledge Graph
 *
 * Entity extraction + relationship mapping from user data.
 * Creates a graph of: People, Organizations, Topics, Events, Locations, Projects, Concepts
 * with typed relationships between them.
 *
 * Used for:
 * - Rich context for AI conversations
 * - "Who is X?" / "What is X related to?" queries
 * - Connection discovery (multi-hop traversal)
 * - Memory navigation and knowledge map
 * - Entity-aware search (boost results related to known entities)
 *
 * Enhanced features:
 * - Multi-hop graph traversal (BFS via SQL function)
 * - Entity merging / deduplication (fuzzy name matching)
 * - Relationship strengthening over repeated mentions
 * - Full subgraph export for AI context injection
 * - Entity embeddings for semantic entity search
 */

import { aiChat } from "@/lib/ai";
import { getServiceSupabase } from "@/lib/supabase/service";
import { generateEmbedding } from "./vector-store";

import { logger } from "@/lib/logger";
// ============================================================================
// TYPES
// ============================================================================

export type EntityType =
  | "person"
  | "organization"
  | "topic"
  | "event"
  | "location"
  | "project"
  | "concept";
export type RelationType =
  | "knows"
  | "works_at"
  | "related_to"
  | "participated_in"
  | "located_at"
  | "part_of"
  | "mentioned_with"
  | "caused"
  | "blocked_by"
  | "depends_on"
  | "created"
  | "owns"
  | "manages"
  | "reports_to";

export interface Entity {
  id?: string;
  tenantId: string;
  name: string;
  type: EntityType;
  aliases?: string[];
  description?: string;
  properties?: Record<string, unknown>;
  importance: number; // 0-1
  mentionCount: number;
  lastMentioned?: string;
}

export interface Relationship {
  id?: string;
  tenantId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  strength: number; // 0-1
  context?: string;
  lastUpdated?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: EntityType;
  importance: number;
  mentionCount: number;
  description?: string;
  hopDistance: number;
  connections: GraphEdge[];
}

export interface GraphEdge {
  targetId: string;
  targetName: string;
  relationshipType: RelationType;
  strength: number;
}

// ============================================================================
// ENTITY EXTRACTION
// ============================================================================

/**
 * Extract entities and relationships from text using AI.
 * Returns structured entities with types, descriptions, and relationships.
 */
export async function extractEntities(
  text: string,
  tenantId: string,
): Promise<{
  entities: Omit<Entity, "id">[];
  relationships: (Omit<
    Relationship,
    "id" | "sourceEntityId" | "targetEntityId"
  > & { source: string; target: string })[];
}> {
  const result = await aiChat(
    [
      {
        role: "system",
        content: `Extract entities and relationships from the text. Be thorough but don't hallucinate.

Respond as JSON:
{
  "entities": [{
    "name": "...",
    "type": "person|organization|topic|event|location|project|concept",
    "description": "1-sentence description",
    "importance": 0.5,
    "properties": {}
  }],
  "relationships": [{
    "source": "entity_name",
    "target": "entity_name",
    "type": "knows|works_at|related_to|participated_in|located_at|part_of|mentioned_with|caused|blocked_by|depends_on|created|owns|manages|reports_to",
    "strength": 0.8,
    "context": "brief description of the relationship"
  }]
}

Rules:
- Names should be canonical (e.g., "John Smith" not "John" or "he")
- Importance: 0.1-0.3 (minor mention), 0.4-0.6 (relevant), 0.7-1.0 (key entity)
- Only extract entities that are clearly mentioned or implied
- Relationship strength: 0.1-0.3 (weak), 0.4-0.6 (moderate), 0.7-1.0 (strong)`,
      },
      { role: "user", content: text.slice(0, 6000) },
    ],
    {
      forceModel: "claude-3-5-haiku",
      maxTokens: 3000,
    },
  );

  try {
    const jsonMatch = result.content?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        entities: (parsed.entities || []).map((e: Record<string, unknown>) => ({
          tenantId,
          name: String(e.name).trim(),
          type: (e.type as EntityType) || "concept",
          description: e.description as string | undefined,
          aliases: (e.aliases as string[]) || [],
          properties: (e.properties as Record<string, unknown>) || {},
          importance: Math.min(1, Math.max(0, (e.importance as number) || 0.5)),
          mentionCount: 1,
          lastMentioned: new Date().toISOString(),
        })),
        relationships: (parsed.relationships || []).map(
          (r: Record<string, unknown>) => ({
            tenantId,
            source: String(r.source).trim(),
            target: String(r.target).trim(),
            type: (r.type as RelationType) || "related_to",
            strength: Math.min(1, Math.max(0, (r.strength as number) || 0.5)),
            context: r.context as string,
          }),
        ),
      };
    }
  } catch {
    // Parse failure — return empty
  }

  return { entities: [], relationships: [] };
}

// ============================================================================
// STORAGE — with dedup/merge
// ============================================================================

/**
 * Store entities and relationships, merging with existing.
 * Uses fuzzy matching (ILIKE) to find existing entities.
 * Strengthens relationships on repeated mentions.
 */
export async function storeEntities(
  tenantId: string,
  entities: Omit<Entity, "id">[],
  relationships: (Omit<
    Relationship,
    "id" | "sourceEntityId" | "targetEntityId"
  > & { source: string; target: string })[],
): Promise<{ stored: number; merged: number; relationships: number }> {
  const supabase = getServiceSupabase();
  let stored = 0;
  let merged = 0;
  let relCount = 0;

  // Upsert entities — build name→id map
  const entityIdMap = new Map<string, string>();

  for (const entity of entities) {
    const normalizedName = entity.name.toLowerCase().trim();

    // Check if entity exists (exact or alias match)
    const { data: existing } = await supabase
      .from("exo_knowledge_entities")
      .select("id, mention_count, importance, aliases")
      .eq("tenant_id", tenantId)
      .or(`name.ilike.${normalizedName},aliases.cs.{${normalizedName}}`)
      .limit(1);

    if (existing?.length) {
      // Merge: increment mention count, update importance (keep higher)
      const currentImportance = existing[0].importance || 0.5;
      const newImportance = Math.max(currentImportance, entity.importance);

      // Add name as alias if it's different from stored name
      const currentAliases: string[] = existing[0].aliases || [];
      if (!currentAliases.includes(normalizedName)) {
        currentAliases.push(normalizedName);
      }

      await supabase
        .from("exo_knowledge_entities")
        .update({
          mention_count: (existing[0].mention_count || 0) + 1,
          last_mentioned: new Date().toISOString(),
          importance: newImportance,
          aliases: currentAliases,
          properties: entity.properties,
          description: entity.description || undefined,
        })
        .eq("id", existing[0].id);

      entityIdMap.set(normalizedName, existing[0].id);
      merged++;
    } else {
      // Create new entity
      const insertData: Record<string, unknown> = {
        tenant_id: tenantId,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        properties: entity.properties || {},
        importance: entity.importance,
        aliases: [normalizedName],
        mention_count: 1,
        last_mentioned: new Date().toISOString(),
      };

      // Generate embedding for entity name + description (for semantic entity search)
      try {
        const embeddingText = `${entity.name}: ${entity.description || entity.type}`;
        const embedding = await generateEmbedding(embeddingText);
        insertData.embedding = JSON.stringify(embedding);
      } catch {
        // Embedding generation failed — not critical
      }

      const { data: inserted } = await supabase
        .from("exo_knowledge_entities")
        .insert(insertData)
        .select("id")
        .single();

      if (inserted) {
        entityIdMap.set(normalizedName, inserted.id);
        stored++;
      }
    }
  }

  // Store relationships with strength reinforcement
  for (const rel of relationships) {
    const sourceId = entityIdMap.get(rel.source.toLowerCase().trim());
    const targetId = entityIdMap.get(rel.target.toLowerCase().trim());

    if (!sourceId || !targetId || sourceId === targetId) continue;

    // Check if relationship exists
    const { data: existingRel } = await supabase
      .from("exo_knowledge_relationships")
      .select("id, strength")
      .eq("tenant_id", tenantId)
      .eq("source_entity_id", sourceId)
      .eq("target_entity_id", targetId)
      .eq("type", rel.type)
      .limit(1);

    if (existingRel?.length) {
      // Strengthen existing relationship (cap at 1.0)
      const newStrength = Math.min(1.0, (existingRel[0].strength || 0.5) + 0.1);
      await supabase
        .from("exo_knowledge_relationships")
        .update({
          strength: newStrength,
          context: rel.context || undefined,
          last_updated: new Date().toISOString(),
        })
        .eq("id", existingRel[0].id);
    } else {
      await supabase.from("exo_knowledge_relationships").insert({
        tenant_id: tenantId,
        source_entity_id: sourceId,
        target_entity_id: targetId,
        type: rel.type,
        strength: rel.strength,
        context: rel.context,
        last_updated: new Date().toISOString(),
      });
    }
    relCount++;
  }

  return { stored, merged, relationships: relCount };
}

// ============================================================================
// QUERYING
// ============================================================================

/**
 * Query knowledge graph — find entity and its direct connections.
 */
export async function queryEntity(
  tenantId: string,
  entityName: string,
): Promise<{
  entity: Entity | null;
  connections: Array<{ entity: Entity; relationship: Relationship }>;
}> {
  const supabase = getServiceSupabase();

  // Find entity (fuzzy match)
  const { data: entities } = await supabase
    .from("exo_knowledge_entities")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(`name.ilike.%${entityName}%,aliases.cs.{${entityName.toLowerCase()}}`)
    .order("mention_count", { ascending: false })
    .limit(1);

  if (!entities?.length) return { entity: null, connections: [] };

  const entity = mapEntity(entities[0]);

  // Find relationships
  const { data: rels } = await supabase
    .from("exo_knowledge_relationships")
    .select(
      "*, source:exo_knowledge_entities!source_entity_id(*), target:exo_knowledge_entities!target_entity_id(*)",
    )
    .eq("tenant_id", tenantId)
    .or(`source_entity_id.eq.${entity.id},target_entity_id.eq.${entity.id}`)
    .order("strength", { ascending: false })
    .limit(30);

  const connections = (rels || []).map((r: Record<string, unknown>) => {
    const isSource =
      (r as Record<string, unknown>).source_entity_id === entity.id;
    const connectedEntity = isSource ? r.target : r.source;
    return {
      entity: mapEntity(connectedEntity as Record<string, unknown>),
      relationship: r as unknown as Relationship,
    };
  });

  return { entity, connections };
}

/**
 * Multi-hop graph traversal using SQL function.
 * Returns subgraph around a starting entity.
 */
export async function traverseGraph(
  tenantId: string,
  entityName: string,
  maxHops: number = 2,
  maxResults: number = 50,
): Promise<GraphNode[]> {
  const supabase = getServiceSupabase();

  // First find the entity
  const { data: entities } = await supabase
    .from("exo_knowledge_entities")
    .select("id, name, type, importance, mention_count, description")
    .eq("tenant_id", tenantId)
    .or(`name.ilike.%${entityName}%,aliases.cs.{${entityName.toLowerCase()}}`)
    .order("mention_count", { ascending: false })
    .limit(1);

  if (!entities?.length) return [];

  const startEntity = entities[0];

  // Use SQL function for BFS traversal
  const { data: traversalData, error } = await supabase.rpc(
    "traverse_knowledge_graph",
    {
      match_tenant_id: tenantId,
      start_entity_id: startEntity.id,
      max_hops: maxHops,
      max_results: maxResults,
    },
  );

  if (error) {
    logger.warn("[KnowledgeGraph:traverse:rpcFailed]", error.message);
    // Fallback to direct connections only
    const result = await queryEntity(tenantId, entityName);
    if (!result.entity) return [];
    return [
      {
        id: result.entity.id!,
        name: result.entity.name,
        type: result.entity.type,
        importance: result.entity.importance,
        mentionCount: result.entity.mentionCount,
        description: result.entity.description,
        hopDistance: 0,
        connections: result.connections.map((c) => ({
          targetId: c.entity.id!,
          targetName: c.entity.name,
          relationshipType: c.relationship.type,
          strength: c.relationship.strength,
        })),
      },
    ];
  }

  // Build node map from traversal
  const nodeMap = new Map<string, GraphNode>();

  // Add starting entity
  nodeMap.set(startEntity.id, {
    id: startEntity.id,
    name: startEntity.name,
    type: startEntity.type as EntityType,
    importance: startEntity.importance || 0.5,
    mentionCount: startEntity.mention_count || 1,
    description: startEntity.description,
    hopDistance: 0,
    connections: [],
  });

  // Add traversed entities
  for (const row of traversalData || []) {
    const entityId = row.entity_id as string;
    if (!nodeMap.has(entityId)) {
      nodeMap.set(entityId, {
        id: entityId,
        name: row.entity_name as string,
        type: row.entity_type as EntityType,
        importance: 0.5,
        mentionCount: 0,
        hopDistance: row.hop_distance as number,
        connections: [],
      });
    }

    // Add edge from connected_via node to this node
    const connectedVia = row.connected_via as string;
    if (connectedVia) {
      // Find the node that connects to this one
      for (const [, node] of nodeMap) {
        if (node.name === connectedVia) {
          node.connections.push({
            targetId: entityId,
            targetName: row.entity_name as string,
            relationshipType: row.relationship_type as RelationType,
            strength: row.relationship_strength as number,
          });
          break;
        }
      }
    }
  }

  return Array.from(nodeMap.values()).sort(
    (a, b) => a.hopDistance - b.hopDistance,
  );
}

/**
 * Search entities by name (fuzzy) using pg_trgm.
 */
export async function searchEntities(
  tenantId: string,
  query: string,
  entityTypes?: EntityType[],
  limit: number = 20,
): Promise<Entity[]> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("search_entities", {
    match_tenant_id: tenantId,
    search_name: query,
    entity_types: entityTypes || null,
    match_limit: limit,
  });

  if (error) {
    logger.warn("[KnowledgeGraph:searchEntities:rpcFailed]", error.message);
    // Fallback to ILIKE
    let q = supabase
      .from("exo_knowledge_entities")
      .select("*")
      .eq("tenant_id", tenantId)
      .ilike("name", `%${query}%`)
      .order("mention_count", { ascending: false })
      .limit(limit);

    if (entityTypes?.length) {
      q = q.in("type", entityTypes);
    }

    const { data: fallback } = await q;
    return (fallback || []).map(mapEntity);
  }

  return (data || []).map(mapEntity);
}

// ============================================================================
// INGESTION PIPELINE INTEGRATION
// ============================================================================

/**
 * Process content through the knowledge graph pipeline.
 * Extracts entities + relationships, stores/merges them.
 */
export async function processContentForGraph(
  tenantId: string,
  content: string,
  sourceType: string,
  sourceId?: string,
): Promise<{ entities: number; relationships: number }> {
  const { entities, relationships } = await extractEntities(content, tenantId);

  if (entities.length === 0) return { entities: 0, relationships: 0 };

  const result = await storeEntities(tenantId, entities, relationships);

  logger.info("[KnowledgeGraph:processed]", {
    tenantId: tenantId.slice(0, 8),
    sourceType,
    sourceId: sourceId?.slice(0, 8),
    entities: result.stored + result.merged,
    relationships: result.relationships,
  });

  return {
    entities: result.stored + result.merged,
    relationships: result.relationships,
  };
}

// ============================================================================
// CONTEXT EXPORT — for AI conversation context injection
// ============================================================================

/**
 * Get graph summary for AI context.
 * Returns a formatted string with top entities and their connections.
 */
export async function getGraphSummary(tenantId: string): Promise<string> {
  const supabase = getServiceSupabase();

  // Top entities by importance × mention count
  const { data: topEntities } = await supabase
    .from("exo_knowledge_entities")
    .select("name, type, mention_count, importance, description")
    .eq("tenant_id", tenantId)
    .order("mention_count", { ascending: false })
    .limit(30);

  if (!topEntities?.length) return "Knowledge graph: empty.";

  const lines = ["=== Knowledge Graph ==="];
  const byType = new Map<string, string[]>();

  for (const e of topEntities) {
    const list = byType.get(e.type) || [];
    const desc = e.description ? ` — ${e.description}` : "";
    list.push(`${e.name} (×${e.mention_count})${desc}`);
    byType.set(e.type, list);
  }

  for (const [type, names] of byType) {
    lines.push(`  ${type}: ${names.join(", ")}`);
  }

  // Top relationships
  const { data: topRels } = await supabase
    .from("exo_knowledge_relationships")
    .select(
      "type, strength, context, source:exo_knowledge_entities!source_entity_id(name), target:exo_knowledge_entities!target_entity_id(name)",
    )
    .eq("tenant_id", tenantId)
    .order("strength", { ascending: false })
    .limit(15);

  if (topRels?.length) {
    lines.push("  Key relationships:");
    for (const r of topRels) {
      const source = (r.source as unknown as { name: string })?.name || "?";
      const target = (r.target as unknown as { name: string })?.name || "?";
      lines.push(`    ${source} —[${r.type}]→ ${target} (str: ${r.strength})`);
    }
  }

  return lines.join("\n");
}

/**
 * Get focused context about specific entities for AI prompt injection.
 * Returns rich context about entities mentioned in the conversation.
 */
export async function getEntityContext(
  tenantId: string,
  entityNames: string[],
): Promise<string> {
  if (entityNames.length === 0) return "";

  const lines: string[] = [];

  for (const name of entityNames.slice(0, 5)) {
    const result = await queryEntity(tenantId, name);
    if (!result.entity) continue;

    const e = result.entity;
    lines.push(`\n[${e.type.toUpperCase()}] ${e.name}`);
    if (e.description) lines.push(`  ${e.description}`);
    lines.push(`  Mentions: ${e.mentionCount}, Importance: ${e.importance}`);

    if (result.connections.length > 0) {
      lines.push("  Connections:");
      for (const c of result.connections.slice(0, 5)) {
        lines.push(
          `    → ${c.entity.name} (${c.relationship.type}, str: ${c.relationship.strength})`,
        );
      }
    }
  }

  return lines.length > 0 ? `=== Entity Context ===\n${lines.join("\n")}` : "";
}

/**
 * Get full subgraph export for a topic (for deep AI context).
 * Used for strategic/complex queries that need rich knowledge.
 */
export async function exportSubgraph(
  tenantId: string,
  centerEntity: string,
  maxHops: number = 2,
): Promise<{
  nodes: GraphNode[];
  summary: string;
  entityCount: number;
  relationshipCount: number;
}> {
  const nodes = await traverseGraph(tenantId, centerEntity, maxHops, 100);

  let relationshipCount = 0;
  const lines: string[] = [
    `Subgraph around "${centerEntity}" (${maxHops} hops):`,
  ];

  for (const node of nodes) {
    const indent = "  ".repeat(node.hopDistance);
    lines.push(
      `${indent}[${node.type}] ${node.name} (hop: ${node.hopDistance})`,
    );
    for (const conn of node.connections) {
      lines.push(`${indent}  → ${conn.targetName} (${conn.relationshipType})`);
      relationshipCount++;
    }
  }

  return {
    nodes,
    summary: lines.join("\n"),
    entityCount: nodes.length,
    relationshipCount,
  };
}

// ============================================================================
// ENTITY MERGING / CLEANUP
// ============================================================================

/**
 * Find potential duplicate entities for a tenant.
 * Returns pairs of entities that may be the same.
 */
export async function findDuplicates(
  tenantId: string,
): Promise<Array<{ entity1: Entity; entity2: Entity; similarity: number }>> {
  const supabase = getServiceSupabase();

  const { data: allEntities } = await supabase
    .from("exo_knowledge_entities")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("mention_count", { ascending: false })
    .limit(200);

  if (!allEntities || allEntities.length < 2) return [];

  const duplicates: Array<{
    entity1: Entity;
    entity2: Entity;
    similarity: number;
  }> = [];

  // Simple pairwise comparison (for larger graphs, use pg_trgm similarity in SQL)
  for (let i = 0; i < allEntities.length; i++) {
    for (let j = i + 1; j < allEntities.length; j++) {
      const name1 = allEntities[i].name.toLowerCase();
      const name2 = allEntities[j].name.toLowerCase();

      // Check if one name contains the other
      if (name1.includes(name2) || name2.includes(name1)) {
        duplicates.push({
          entity1: mapEntity(allEntities[i]),
          entity2: mapEntity(allEntities[j]),
          similarity: 0.8,
        });
      }
    }
  }

  return duplicates;
}

/**
 * Merge two entities: keep the higher-count one, transfer relationships.
 */
export async function mergeEntities(
  tenantId: string,
  keepEntityId: string,
  mergeEntityId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceSupabase();

  try {
    // Transfer relationships from merged entity to kept entity
    await supabase
      .from("exo_knowledge_relationships")
      .update({ source_entity_id: keepEntityId })
      .eq("source_entity_id", mergeEntityId)
      .eq("tenant_id", tenantId);

    await supabase
      .from("exo_knowledge_relationships")
      .update({ target_entity_id: keepEntityId })
      .eq("target_entity_id", mergeEntityId)
      .eq("tenant_id", tenantId);

    // Get merged entity's aliases and mention count
    const { data: mergedEntity } = await supabase
      .from("exo_knowledge_entities")
      .select("name, aliases, mention_count")
      .eq("id", mergeEntityId)
      .single();

    if (mergedEntity) {
      // Update kept entity
      const { data: keptEntity } = await supabase
        .from("exo_knowledge_entities")
        .select("aliases, mention_count")
        .eq("id", keepEntityId)
        .single();

      const combinedAliases = [
        ...(keptEntity?.aliases || []),
        mergedEntity.name.toLowerCase(),
        ...(mergedEntity.aliases || []),
      ];
      const uniqueAliases = [...new Set(combinedAliases)];

      await supabase
        .from("exo_knowledge_entities")
        .update({
          aliases: uniqueAliases,
          mention_count:
            (keptEntity?.mention_count || 0) +
            (mergedEntity.mention_count || 0),
          last_mentioned: new Date().toISOString(),
        })
        .eq("id", keepEntityId);
    }

    // Delete merged entity
    await supabase
      .from("exo_knowledge_entities")
      .delete()
      .eq("id", mergeEntityId);

    // Clean up self-referencing relationships
    await supabase
      .from("exo_knowledge_relationships")
      .delete()
      .eq("source_entity_id", keepEntityId)
      .eq("target_entity_id", keepEntityId);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function mapEntity(row: Record<string, unknown>): Entity {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: row.name as string,
    type: (row.type as EntityType) || "concept",
    aliases: (row.aliases as string[]) || [],
    description: row.description as string | undefined,
    properties: (row.properties as Record<string, unknown>) || {},
    importance: (row.importance as number) || 0.5,
    mentionCount: (row.mention_count as number) || 0,
    lastMentioned: row.last_mentioned as string | undefined,
  };
}
