export default function getAvatarUrl(user) {
  if (user?.avartarUrl) {
    let base = import.meta.env.VITE_API_BASE_URL || "";
    base = base.replace(/\/$/, "");
    return `${base}/uploads/avatars/${user.avartarUrl}`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.username || "")}&background=FFC1E3&color=fff`;
}