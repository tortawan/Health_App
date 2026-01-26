import { submitLogFood } from "@/app/actions";



export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.foodName) return Response.json({ error: "Missing required field: foodName" }, { status: 400 });
    if (body.weight === undefined || body.weight === null) return Response.json({ error: "Missing required field: weight" }, { status: 400 });

    const result = await submitLogFood(body);

    if (result.data) {
      return Response.json({ data: result.data }, { status: 200 });
    } else if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    } else {
      return Response.json({ error: "Unexpected response from server action" }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}