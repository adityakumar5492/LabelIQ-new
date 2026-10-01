function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClass = "bg-emerald-50 text-emerald-600",
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {title}
          </p>

          <h3 className="mt-2 text-2xl font-bold text-slate-900">
            {value}
          </h3>

          {subtitle && (
            <p className="mt-1 text-xs text-slate-500">
              {subtitle}
            </p>
          )}
        </div>

        <div className={`rounded-xl p-3 ${iconClass}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default StatCard;