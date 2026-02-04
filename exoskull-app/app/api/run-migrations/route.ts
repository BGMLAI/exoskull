import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Create admin client
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: "public",
      },
    });

    // Read migration files
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    const migrations = [
      "20260131000003_use_public_schema.sql",
      "20260131000004_add_tasks_table.sql",
    ];

    const results = [];

    for (const migrationFile of migrations) {
      const filePath = path.join(migrationsDir, migrationFile);
      const sql = fs.readFileSync(filePath, "utf8");

      console.log(`Running migration: ${migrationFile}`);

      try {
        // Execute raw SQL using supabase-js
        const { data, error } = await supabase.rpc("exec_sql", { sql });

        if (error) {
          console.error(`Error in ${migrationFile}:`, error);
          results.push({
            file: migrationFile,
            status: "error",
            error: error.message,
          });
        } else {
          console.log(`✅ ${migrationFile} completed`);
          results.push({ file: migrationFile, status: "success" });
        }
      } catch (err: any) {
        console.error(`Exception in ${migrationFile}:`, err);
        results.push({
          file: migrationFile,
          status: "error",
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
