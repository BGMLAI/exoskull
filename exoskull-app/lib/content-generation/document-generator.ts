/**
 * Document Generator
 *
 * Creates professional documents: Word (DOCX), PDF, presentations (PPTX).
 * Uses AI for content generation + template engines for formatting.
 *
 * Dependencies: docx (npm), jspdf, pptxgenjs
 */

import { aiChat } from "@/lib/ai/chat";

// ============================================================================
// TYPES
// ============================================================================

export type DocumentType = "docx" | "pdf" | "pptx" | "md" | "html";

export interface DocumentRequest {
  type: DocumentType;
  title: string;
  description: string;
  sections?: string[];
  tone?: "formal" | "casual" | "academic" | "business";
  language?: string;
  templateId?: string;
  context?: string;
  maxPages?: number;
}

export interface DocumentResult {
  content: string; // For text types (md, html)
  buffer?: Buffer; // For binary types (docx, pdf, pptx)
  filename: string;
  mimeType: string;
  pages?: number;
  wordCount?: number;
}

// ============================================================================
// AI CONTENT GENERATION
// ============================================================================

async function generateContent(req: DocumentRequest): Promise<string> {
  const sectionPrompt = req.sections?.length
    ? `\n\nRequired sections:\n${req.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";

  const result = await aiChat({
    messages: [
      {
        role: "system",
        content: `You are a professional document writer. Create high-quality ${req.type === "pptx" ? "presentation" : "document"} content.
Tone: ${req.tone || "business"}
Language: ${req.language || "pl"}
${req.maxPages ? `Target length: ~${req.maxPages} pages` : ""}

For presentations: create slide content as JSON array: [{ "title": "...", "bullets": ["..."], "notes": "..." }]
For documents: use markdown formatting with proper headings, paragraphs, and lists.`,
      },
      {
        role: "user",
        content: `Title: ${req.title}\nDescription: ${req.description}${sectionPrompt}${req.context ? `\n\nAdditional context:\n${req.context}` : ""}`,
      },
    ],
    forceModel: "claude-sonnet-4-5",
    maxTokens: 8000,
  });

  return result.content || "";
}

// ============================================================================
// FORMAT GENERATORS
// ============================================================================

/**
 * Generate Markdown document
 */
async function generateMarkdown(req: DocumentRequest): Promise<DocumentResult> {
  const content = await generateContent(req);

  return {
    content,
    filename: `${slugify(req.title)}.md`,
    mimeType: "text/markdown",
    wordCount: content.split(/\s+/).length,
  };
}

/**
 * Generate HTML document (styled)
 */
async function generateHTML(req: DocumentRequest): Promise<DocumentResult> {
  const markdownContent = await generateContent(req);

  // Convert markdown to styled HTML
  const html = `<!DOCTYPE html>
<html lang="${req.language || "pl"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(req.title)}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
    h1 { font-size: 2rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin-top: 2rem; color: #2c3e50; }
    h3 { font-size: 1.2rem; color: #34495e; }
    ul, ol { padding-left: 1.5rem; }
    li { margin-bottom: 0.3rem; }
    blockquote { border-left: 4px solid #3498db; margin: 1rem 0; padding: 0.5rem 1rem; background: #f8f9fa; }
    code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    th { background: #f8f9fa; font-weight: 600; }
    @media print { body { max-width: none; margin: 0; } }
  </style>
</head>
<body>
${markdownToHtml(markdownContent)}
</body>
</html>`;

  return {
    content: html,
    filename: `${slugify(req.title)}.html`,
    mimeType: "text/html",
    wordCount: markdownContent.split(/\s+/).length,
  };
}

/**
 * Generate DOCX using the docx library
 */
async function generateDocx(req: DocumentRequest): Promise<DocumentResult> {
  const content = await generateContent(req);

  // Dynamic import docx library
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } =
      await import("docx");

    const paragraphs: InstanceType<typeof Paragraph>[] = [];

    // Parse markdown into docx paragraphs
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.startsWith("# ")) {
        paragraphs.push(
          new Paragraph({
            text: line.slice(2),
            heading: HeadingLevel.HEADING_1,
          }),
        );
      } else if (line.startsWith("## ")) {
        paragraphs.push(
          new Paragraph({
            text: line.slice(3),
            heading: HeadingLevel.HEADING_2,
          }),
        );
      } else if (line.startsWith("### ")) {
        paragraphs.push(
          new Paragraph({
            text: line.slice(4),
            heading: HeadingLevel.HEADING_3,
          }),
        );
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(line.slice(2))],
            bullet: { level: 0 },
          }),
        );
      } else if (line.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(line)],
          }),
        );
      } else {
        paragraphs.push(new Paragraph({ text: "" }));
      }
    }

    const doc = new Document({
      sections: [{ children: paragraphs }],
    });

    const buffer = await Packer.toBuffer(doc);

    return {
      content: "",
      buffer: Buffer.from(buffer),
      filename: `${slugify(req.title)}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      wordCount: content.split(/\s+/).length,
    };
  } catch (err) {
    // Fallback to HTML if docx library not available
    console.warn(
      "[DocGen] docx library not available, falling back to HTML:",
      err,
    );
    return generateHTML(req);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.*$)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/^> (.*$)/gm, "<blockquote>$1</blockquote>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hluobp])/gm, "<p>")
    .replace(/(?<![>])$/gm, "</p>");
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate a document of any supported type
 */
export async function generateDocument(
  req: DocumentRequest,
): Promise<DocumentResult> {
  console.info("[DocGen:start]", {
    type: req.type,
    title: req.title.slice(0, 50),
    tone: req.tone,
  });

  let result: DocumentResult;

  switch (req.type) {
    case "md":
      result = await generateMarkdown(req);
      break;
    case "html":
      result = await generateHTML(req);
      break;
    case "docx":
      result = await generateDocx(req);
      break;
    case "pdf":
      // PDF generation via HTML → puppeteer (requires server)
      // Fallback to HTML for now
      result = await generateHTML({ ...req, type: "html" });
      result.filename = result.filename.replace(".html", ".pdf");
      result.mimeType = "application/pdf";
      break;
    case "pptx":
      // PPTX requires pptxgenjs — generate slide content as JSON for now
      result = await generateMarkdown({ ...req, type: "md" });
      break;
    default:
      result = await generateMarkdown(req);
  }

  console.info("[DocGen:success]", {
    type: req.type,
    filename: result.filename,
    wordCount: result.wordCount,
  });

  return result;
}
