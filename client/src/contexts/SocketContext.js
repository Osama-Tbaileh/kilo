import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

// Create context
const SocketContext = createContext();

// Socket provider component
export const SocketProvider = ({ children }) => {
  const { user, token, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const socketRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    if (isAuthenticated && token && !socketRef.current) {
      const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:5000', {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setConnected(true);
        
        // Join user-specific room
        if (user?.id) {
          newSocket.emit('join-user-room', user.id);
        }
        
        // Join team room (if user has team)
        if (user?.team) {
          newSocket.emit('join-team-room', user.team);
        }
        
        // Request initial sync status
        newSocket.emit('get-sync-status');
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setConnected(false);
      });

      // Sync status updates
      newSocket.on('sync-status', (status) => {
        setSyncStatus(status);
      });

      newSocket.on('sync-started', (data) => {
        toast.success('Data sync started');
        setSyncStatus(prev => ({ ...prev, inProgress: true }));
      });

      newSocket.on('sync-completed', (data) => {
        toast.success('Data sync completed successfully');
        setSyncStatus(prev => ({ 
          ...prev, 
          inProgress: false, 
          lastSyncTime: data.timestamp 
        }));
      });

      newSocket.on('sync-failed', (data) => {
        toast.error(`Data sync failed: ${data.error}`);
        setSyncStatus(prev => ({ ...prev, inProgress: false }));
      });

      // Real-time data updates
      newSocket.on('metrics-updated', (data) => {
        // Handle metrics updates
        console.log('Metrics updated:', data);
      });

      newSocket.on('new-pull-request', (data) => {
        if (data.author.id !== user?.id) {
          toast.success(`New PR: ${data.title}`, {
            duration: 3000,
            onClick: () => {
              window.open(data.htmlUrl, '_blank');
            }
          });
        }
      });

      newSocket.on('pull-request-merged', (data) => {
        if (data.author.id === user?.id) {
          toast.success(`Your PR was merged: ${data.title}`, {
            duration: 4000,
            onClick: () => {
              window.open(data.htmlUrl, '_blank');
            }
          });
        }
      });

      newSocket.on('review-received', (data) => {
        if (data.prAuthor.id === user?.id) {
          const reviewType = data.state.toLowerCase();
          const message = `${data.reviewer.name} ${reviewType} your PR: ${data.prTitle}`;
          
          if (reviewType === 'approved') {
            toast.success(message, { duration: 4000 });
          } else if (reviewType === 'changes_requested') {
            toast.error(message, { duration: 5000 });
          } else {
            toast(message, { duration: 3000 });
          }
        }
      });

      // Team notifications
      newSocket.on('team-milestone', (data) => {
        toast.success(`Team milestone: ${data.message}`, {
          duration: 5000,
          icon: '🎉'
        });
      });

      newSocket.on('system-notification', (data) => {
        const toastOptions = {
          duration: data.duration || 4000,
        };

        switch (data.type) {
          case 'success':
            toast.success(data.message, toastOptions);
            break;
          case 'error':
            toast.error(data.message, toastOptions);
            break;
          case 'warning':
            toast(data.message, { ...toastOptions, icon: '⚠️' });
            break;
          default:
            toast(data.message, toastOptions);
        }
      });

      return () => {
        newSocket.close();
      };
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
    };
  }, [isAuthenticated, token, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  // Socket utility functions
  const emit = (event, data) => {
    if (socket && connected) {
      socket.emit(event, data);
    }
  };

  const on = (event, callback) => {
    if (socket) {
      socket.on(event, callback);
      
      // Return cleanup function
      return () => {
        socket.off(event, callback);
      };
    }
  };

  const off = (event, callback) => {
    if (socket) {
      socket.off(event, callback);
    }
  };

  // Request sync status
  const requestSyncStatus = () => {
    emit('get-sync-status');
  };

  // Subscribe to user-specific updates
  const subscribeToUserUpdates = (userId) => {
    emit('subscribe-user-updates', userId);
  };

  // Subscribe to repository updates
  const subscribeToRepositoryUpdates = (repositoryId) => {
    emit('subscribe-repository-updates', repositoryId);
  };

  // Subscribe to team updates
  const subscribeToTeamUpdates = (teamId) => {
    emit('subscribe-team-updates', teamId);
  };

  // Context value
  const value = {
    socket,
    connected,
    syncStatus,
    
    // Utility functions
    emit,
    on,
    off,
    
    // Specific functions
    requestSyncStatus,
    subscribeToUserUpdates,
    subscribeToRepositoryUpdates,
    subscribeToTeamUpdates,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

// Custom hook to use socket context
export const useSocket = () => {
  const context = useContext(SocketContext);
  
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  
  return context;
};

// Custom hook for real-time data subscriptions
export const useRealTimeData = (type, id) => {
  const { on, off, subscribeToUserUpdates, subscribeToRepositoryUpdates, subscribeToTeamUpdates } = useSocket();
  const [data, setData] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    // Subscribe to updates based on type
    switch (type) {
      case 'user':
        subscribeToUserUpdates(id);
        break;
      case 'repository':
        subscribeToRepositoryUpdates(id);
        break;
      case 'team':
        subscribeToTeamUpdates(id);
        break;
      default:
        break;
    }

    // Set up event listeners
    const handleDataUpdate = (updateData) => {
      setData(updateData);
      setLastUpdate(new Date());
    };

    const cleanup = on(`${type}-data-update`, handleDataUpdate);

    return () => {
      if (cleanup) cleanup();
    };
  }, [type, id, on, subscribeToUserUpdates, subscribeToRepositoryUpdates, subscribeToTeamUpdates]);

  return { data, lastUpdate };
};

// Custom hook for sync status
export const useSyncStatus = () => {
  const { syncStatus, requestSyncStatus } = useSocket();

  useEffect(() => {
    // Request initial sync status
    requestSyncStatus();
  }, [requestSyncStatus]);

  return syncStatus;
};

export default SocketContext;