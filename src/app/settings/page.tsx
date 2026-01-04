import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { updatePrivacy } from "../actions";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_public")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const togglePrivacy = async (formData: FormData) => {
    "use server";
    const desired = formData.get("is_public") === "on";
    await updatePrivacy(desired);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">
            Settings
          </p>
          <h1 className="text-2xl font-semibold text-white">Data portability</h1>
          <p className="text-sm text-white/60">
            Download a snapshot of your food and weight history as CSV or JSON.
          </p>
        </div>
        <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
          Back to tracker
        </Link>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Privacy</p>
            <p className="text-xs text-white/60">
              Control whether your future social feed activity is visible.
            </p>
          </div>
          <span className="pill bg-white/10 text-xs text-white/60">
            {profile?.is_public ? "Public" : "Private"}
          </span>
        </div>
        <form action={togglePrivacy} className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              defaultChecked={profile?.is_public ?? false}
              name="is_public"
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-white/10"
            />
            Make my profile public
          </label>
          <button className="btn" type="submit">
            Save privacy
          </button>
        </form>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-white">Food logs</p>
        <div className="flex flex-wrap gap-3">
          <a className="btn" href="/api/export?type=food_logs&format=csv">
            Download CSV
          </a>
          <a className="btn bg-white/10 text-white hover:bg-white/20" href="/api/export?type=food_logs&format=json">
            Download JSON
          </a>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-white">Weight logs</p>
        <div className="flex flex-wrap gap-3">
          <a className="btn" href="/api/export?type=weight_logs&format=csv">
            Download CSV
          </a>
          <a className="btn bg-white/10 text-white hover:bg-white/20" href="/api/export?type=weight_logs&format=json">
            Download JSON
          </a>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="text-sm font-semibold text-white">Import from CSV</p>
        <p className="text-xs text-white/60">
          Upload a CSV export (e.g., from MyFitnessPal) with columns like food_name, weight_g,
          calories, protein, carbs, fat. We will map what we can and ignore the rest.
        </p>
        <form
          action="/api/import"
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          encType="multipart/form-data"
          method="post"
        >
          <input
            accept=".csv,text/csv"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none sm:w-auto"
            name="file"
            required
            type="file"
          />
          <button className="btn" type="submit">
            Import CSV
          </button>
        </form>
      </div>
    </div>
  );
}
