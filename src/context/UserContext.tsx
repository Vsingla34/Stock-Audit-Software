import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
      const { data, error } = await supabase.from('user_profiles').select('id, email, name, role, assigned_locations');
      if (error) throw error;

      const mappedUsers = data.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        assignedLocations: user.assigned_locations,
      }));

      setUsers(mappedUsers as UserProfile[]);

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
          .select("id, email, name, role, assigned_locations")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          const mappedProfile: UserProfile = {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            role: profile.role,
            assignedLocations: profile.assigned_locations,
          };
          
          setCurrentUser(mappedProfile);
          setIsAuthenticated(true);
          await fetchAllUsers(mappedProfile.role);
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

  const createUser = async (userData: Omit<UserProfile, 'id'>, pass: string) => {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: pass,
    });

    if (authError) throw new Error(authError.message);
    if (!authData.user) throw new Error("User not created successfully.");

    const { error: rpcError } = await supabase.rpc('create_user_profile', {
      user_id: authData.user.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      assigned_locations: userData.assignedLocations || [],
    });

    if (rpcError) {
      // @ts-ignore
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(rpcError.message);
    }
    
    await fetchAllUsers(currentUser?.role);
  };

  const updateUser = async (profileData: UserProfile) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        name: profileData.name,
        role: profileData.role,
        assigned_locations: profileData.assignedLocations,
      })
      .eq('id', profileData.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("Failed to retrieve updated user profile.");

    const updatedMappedProfile: UserProfile = {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      assignedLocations: data.assigned_locations,
    };

    setUsers(prevUsers => 
      prevUsers.map(user => 
        user.id === updatedMappedProfile.id ? updatedMappedProfile : user
      )
    );

    if (currentUser?.id === updatedMappedProfile.id) {
      setCurrentUser(updatedMappedProfile);
    }
  };

  const deleteUser = async (userId: string) => {
    console.log('Attempting to delete user:', userId);
    
    const { data, error } = await supabase.rpc('delete_user', {
      user_id: userId
    });

    console.log('RPC response - data:', data, 'error:', error);

    if (error) {
      console.error('Delete user error:', error);
      throw new Error(error.message);
    }

    // Only update the local state after successful deletion from database
    setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
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