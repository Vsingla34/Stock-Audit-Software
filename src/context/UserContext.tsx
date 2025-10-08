import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// This interface was incomplete in previous versions. This is from your files.
export interface UserProfile {
  id: string;
  email: string;
  role: "admin" | "auditor" | "client";
  name: string;
  companyId?: string;
  assignedLocations?: string[];
}

interface UserContextType {
  currentUser: UserProfile | null;
  users: UserProfile[];
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  registerUser: (user: Omit<UserProfile, "id">, password: string) => Promise<void>;
  updateUser: (user: UserProfile) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  assignLocationToUser: (userId: string, locationId: string) => Promise<void>;
  removeLocationFromUser: (userId: string, locationId: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  getUsersForLocation: (locationId: string) => UserProfile[];
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // This function now handles getting the user AND their profile in one go.
    const fetchUserAndProfile = async () => {
      // 1. Get the current user session from Supabase
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // 2. If a user exists, fetch their profile from your 'user_profiles' table
        const { data: profile, error } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (error) {
          // If profile fetch fails, it might be a stale session. Log out.
          console.error("Error fetching profile, logging out:", error);
          await supabase.auth.signOut();
          setCurrentUser(null);
          setIsAuthenticated(false);
        } else if (profile) {
          // 3. If profile is found, set user state
          setCurrentUser(profile);
          setIsAuthenticated(true);
        }
      } else {
        // No user session found
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
      // 4. IMPORTANT: Always stop loading after the check is complete.
      setLoading(false);
    };

    // Run the check on initial load
    fetchUserAndProfile();

    // Listen for any future changes in authentication state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // When auth state changes, re-run the check to get the latest user and profile.
        // This handles login, logout, and token refresh events gracefully.
        fetchUserAndProfile();
      }
    );

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // No need to set user state here, the onAuthStateChange listener will handle it.
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // No need to set user state here, the onAuthStateChange listener will handle it.
  };

  // --- Placeholder functions from your original file ---
  const fetchUsers = async () => {};
  const registerUser = async (userData: Omit<UserProfile, "id">, password: string) => {};
  const updateUser = async (updatedUser: UserProfile) => {};
  const deleteUser = async (userId: string) => {};
  const assignLocationToUser = async (userId: string, locationId: string) => {};
  const removeLocationFromUser = async (userId: string, locationId: string) => {};
  
  const hasPermission = (permission: string): boolean => {
    if (!currentUser) return false;
    switch (permission) {
      case "viewAllLocations": return currentUser.role === "admin";
      case "manageUsers": return currentUser.role === "admin";
      case "viewReports": return ["admin", "client"].includes(currentUser.role);
      case "conductAudits": return ["admin", "auditor"].includes(currentUser.role);
      default: return false;
    }
  };
  
  const getUsersForLocation = (locationId: string): UserProfile[] => {
    return []; // Placeholder
  };

  return (
    <UserContext.Provider value={{ currentUser, users, isAuthenticated, loading, login, logout, registerUser, updateUser, deleteUser, assignLocationToUser, removeLocationFromUser, hasPermission, getUsersForLocation }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};