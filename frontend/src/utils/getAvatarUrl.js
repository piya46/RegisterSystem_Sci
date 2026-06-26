export default function getAvatarUrl(user) {

  if (user?.avatarUrl) {
    let base = import.meta.env.VITE_API_BASE_URL || "";

    base = base.replace(/\/api\/?$/, ""); 
    
    return `${base}/uploads/avatars/${user.avatarUrl}`;
  }
  return "";
}
