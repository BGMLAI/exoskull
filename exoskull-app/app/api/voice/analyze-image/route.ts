/**
 * L3: Multimodal - Image Analysis API
 *
 * Accepts image upload, stores in Supabase, analyzes with GPT-4 Vision
 * Can be triggered by voice: "Co jest na tym zdjęciu?"
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getServiceSupabase } from "@/lib/supabase/service";

import { logger } from "@/lib/logger";
export const dynamic = "force-dynamic";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceSupabase();
    const openai = getOpenAI();
    const contentType = req.headers.get("content-type") || "";

    let imageUrl: string;
    let tenantId: string;
    let prompt: string =
      "Opisz co widzisz na tym obrazie. Odpowiedz po polsku, krótko.";

    // Handle JSON with base64 or URL
    if (contentType.includes("application/json")) {
      const body = await req.json();
      tenantId = body.tenant_id;
      prompt = body.prompt || prompt;

      if (body.image_url) {
        imageUrl = body.image_url;
      } else if (body.image_base64) {
        // Upload base64 to Supabase storage
        const buffer = Buffer.from(body.image_base64, "base64");
        const fileName = `${tenantId}/${Date.now()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("user-images")
          .upload(fileName, buffer, { contentType: "image/jpeg" });

        if (uploadError) {
          console.error("[AnalyzeImage] Upload error:", uploadError);
          return NextResponse.json(
            { error: uploadError.message },
            { status: 500 },
          );
        }

        const { data: urlData } = supabase.storage
          .from("user-images")
          .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;
      } else {
        return NextResponse.json(
          { error: "image_url or image_base64 required" },
          { status: 400 },
        );
      }
    }
    // Handle multipart form data
    else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("image") as File;
      tenantId = formData.get("tenant_id") as string;
      prompt = (formData.get("prompt") as string) || prompt;

      if (!file) {
        return NextResponse.json(
          { error: "image file required" },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = `${tenantId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("user-images")
        .upload(fileName, buffer, { contentType: file.type });

      if (uploadError) {
        console.error("[AnalyzeImage] Upload error:", uploadError);
        return NextResponse.json(
          { error: uploadError.message },
          { status: 500 },
        );
      }

      const { data: urlData } = supabase.storage
        .from("user-images")
        .getPublicUrl(fileName);

      imageUrl = urlData.publicUrl;
    } else {
      return NextResponse.json(
        { error: "Unsupported content type" },
        { status: 400 },
      );
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenant_id required" },
        { status: 400 },
      );
    }

    logger.info("[AnalyzeImage] Analyzing:", {
      tenantId,
      imageUrl: imageUrl.substring(0, 50) + "...",
    });

    // Analyze with GPT-4 Vision
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
      max_tokens: 300,
    });

    const analysis =
      response.choices[0]?.message?.content ||
      "Nie udało się przeanalizować obrazu.";

    // Store in conversation context
    await supabase.from("exo_image_analyses").insert({
      tenant_id: tenantId,
      image_url: imageUrl,
      prompt,
      analysis,
      model: "gpt-4o-mini",
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      image_url: imageUrl,
      analysis,
      message: analysis,
    });
  } catch (error) {
    console.error("[AnalyzeImage] Error:", error);
    return NextResponse.json(
      { error: "Image analysis failed" },
      { status: 500 },
    );
  }
}
