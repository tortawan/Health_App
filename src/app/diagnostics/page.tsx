import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getRequestMetricsSummary } from "@/app/actions";
import { DiagnosticsClient } from "./diagnostics-client";

export default async function DiagnosticsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!session || !adminEmail || session.user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
    redirect("/");
  }

  const metrics = await getRequestMetricsSummary();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200">Diagnostics</p>
          <h1 className="text-2xl font-semibold text-white">Analyze request metrics</h1>
          <p className="text-sm text-white/60">
            Private dashboard for {adminEmail}. Metrics are read using the service role.
          </p>
        </div>
        <Link className="btn bg-white/10 text-white hover:bg-white/20" href="/">
          Back to app
        </Link>
      </div>

      {metrics.error ? (
        <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          {metrics.error}
        </div>
      ) : null}

      <DiagnosticsClient metrics={metrics} />
    </div>
  );
}
