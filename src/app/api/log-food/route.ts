import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";

type MacroMatch = {
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  fiber_100g?: number | null;
  sugar_100g?: number | null;
  sodium_100g?: number | null;
};

type Payload = {
  foodName: string;
  weight: number;
  match?: MacroMatch | null;
  imageUrl?: string | null;
  manualMacros?: {
    calories: number | null;
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
  };
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "You must be signed in to log food." }, { status: 401 });
  }

  const body = (await request.json()) as Payload;
  const factor = body.weight / 100;
  const calc = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Number(value) * factor;

  const calories =
    body.manualMacros?.calories ?? calc(body.match?.kcal_100g ?? null);
  const protein =
    body.manualMacros?.protein ?? calc(body.match?.protein_100g ?? null);
  const carbs =
    body.manualMacros?.carbs ?? calc(body.match?.carbs_100g ?? null);
  const fat = body.manualMacros?.fat ?? calc(body.match?.fat_100g ?? null);
  const fiber = calc(body.match?.fiber_100g ?? null);
  const sugar = calc(body.match?.sugar_100g ?? null);
  const sodium = calc(body.match?.sodium_100g ?? null);

  const { data, error } = await supabase
    .from("food_logs")
    .insert({
      user_id: session.user.id,
      food_name: body.foodName,
      weight_g: body.weight,
      image_path: body.imageUrl ?? null,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      sugar,
      sodium,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/stats");

  return NextResponse.json(data);
}
