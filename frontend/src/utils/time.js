export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs  = Math.floor(diff / 1000);
  if (secs < 60)   return "just now";
  const mins  = Math.floor(secs / 60);
  if (mins < 60)   return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)  return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days  = Math.floor(hours / 24);
  if (days === 1)  return "yesterday";
  if (days < 7)    return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
