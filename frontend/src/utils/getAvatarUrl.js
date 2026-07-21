export default function getAvatarUrl(user) {

  if (user?.avatarUrl) {
    let base = import.meta.env.VITE_API_BASE_URL || "";

    base = base.replace(/\/api\/?$/, ""); 
    if (/^https?:\/\//i.test(user.avatarUrl)) return user.avatarUrl;
    if (user.avatarUrl.startsWith('/')) return `${base}${user.avatarUrl}`;
    return `${base}/uploads/avatars/${user.avatarUrl}`;
  }
  return "";
}
