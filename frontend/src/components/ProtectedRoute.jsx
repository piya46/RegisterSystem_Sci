// import React from "react";
// import { Navigate } from "react-router-dom";
// import useAuth from "../hooks/useAuth";
// import { Box, CircularProgress } from "@mui/material";

// export default function ProtectedRoute({ children, roles }) {
//   const { user, loading } = useAuth();

//   if (loading)
//     return (
//       <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
//         <CircularProgress color="primary" />
//       </Box>
//     );

//   if (!user) return <Navigate to="/login" />;

//   if (roles) {
//     const userRoles = Array.isArray(user.role) ? user.role : [user.role];
//     const hasRole = roles.some(role => userRoles.includes(role));
//     if (!hasRole) {
//       return <Navigate to="/unauthorized" />;
//     }
//   }

//   return children;
// }

import React from "react";
import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { Box, CircularProgress } from "@mui/material";

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
        <CircularProgress color="primary" />
      </Box>
    );
  if (!user) return <Navigate to="/login" />;
  if (roles) {
    const userRoles = Array.isArray(user.role) ? user.role : [user.role];
    if (!roles.some(role => userRoles.includes(role)))
      return <Navigate to="/unauthorized" />;
  }
  return children;
}
