export default function getAvatarUrl(user) {

  if (user?.avatarUrl) {
    let base = import.meta.env.VITE_API_BASE_URL || "";

    base = base.replace(/\/api\/?$/, ""); 
    
    return `${base}/uploads/avatars/${user.avatarUrl}`;
  }
  
  // รูป Default (UI Avatars)
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || user?.username || "")}&background=FFC1E3&color=fff&size=128&bold=true`;
}