import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

// User profile structure from your database
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'auditor' | 'client';
  assignedLocations?: string[];
}

// Defines what the context will provide
interface UserContextType {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  users: UserProfile[];
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  createUser: (userData: Omit<UserProfile, 'id'>, pass: string) => Promise<void>;
  updateUser: (profileData: UserProfile) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllUsers = useCallback(async (userRole: string | undefined) => {
    if (userRole !== 'admin') {
      setUsers([]);
      return;
    }
    try {
      const { data, error } = await supabase.from('user_profiles').select('*');
      if (error) throw error;
      setUsers(data as UserProfile[]);
    } catch (error) {
      console.error("Error fetching all users:", error);
    }
  }, []);

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          setCurrentUser(profile as UserProfile);
          setIsAuthenticated(true);
          await fetchAllUsers(profile.role);
        } else {
          await supabase.auth.signOut();
          setCurrentUser(null);
          setIsAuthenticated(false);
        }
      } else {
        setCurrentUser(null);
        setIsAuthenticated(false);
      }
      setLoading(false);
    };

    fetchSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          fetchSession();
        }
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          setIsAuthenticated(false);
          setUsers([]);
          setLoading(false);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchAllUsers]);

  const login = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // *** THIS IS THE UPDATED FUNCTION ***
  const createUser = async (userData: Omit<UserProfile, 'id'>, pass: string) => {
    // Step 1: Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: pass,
    });

    if (authError) throw new Error(authError.message);
    if (!authData.user) throw new Error("User not created successfully.");

    // Step 2: Call the RPC function to create the profile
    const { error: rpcError } = await supabase.rpc('create_user_profile', {
      user_id: authData.user.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      assigned_locations: userData.assignedLocations || [],
    });

    if (rpcError) {
      // If profile creation fails, clean up the auth user
      // This part requires admin privileges on the client, which is fine for an admin panel
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(rpcError.message);
    }
    
    // Refresh the list of users after successful creation
    await fetchAllUsers(currentUser?.role);
  };

  const updateUser = async (profileData: UserProfile) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({
          name: profileData.name,
          role: profileData.role,
          assigned_locations: profileData.assignedLocations,
       })
      .eq('id', profileData.id);
    if (error) throw error;
    await fetchAllUsers(currentUser?.role);
  };

  const deleteUser = async (userId: string) => {
    // Note: this should ideally be an RPC call as well for security
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    await fetchAllUsers(currentUser?.role);
  };

  const hasPermission = (permission: string) => {
    if (!currentUser) return false;
    switch (permission) {
      case 'manageUsers': return currentUser.role === 'admin';
      case 'conductAudits': return ['admin', 'auditor'].includes(currentUser.role);
      default: return false;
    }
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        users,
        loading,
        login,
        logout,
        createUser,
        updateUser,
        deleteUser,
        hasPermission,
      }}
    >
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