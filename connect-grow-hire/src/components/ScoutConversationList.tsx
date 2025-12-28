// src/components/ScoutConversationList.tsx
import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X,
  Clock
} from 'lucide-react';
import { 
  ScoutConversation, 
  getConversations, 
  deleteConversation,
  updateConversationTitle 
} from '@/services/scoutConversations';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';

interface ScoutConversationListProps {
  currentConversationId: string | null;
  onSelectConversation: (conversation: ScoutConversation) => void;
  onNewConversation: () => void;
  refreshTrigger?: number; // Add refresh trigger prop
}

export const ScoutConversationList: React.FC<ScoutConversationListProps> = ({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  refreshTrigger
}) => {
  const { user } = useFirebaseAuth();
  const [conversations, setConversations] = useState<ScoutConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.uid) {
      loadConversations();
    }
  }, [user?.uid, refreshTrigger]); // Add refreshTrigger to dependencies

  const loadConversations = async () => {
    if (!user?.uid) return;
    
    try {
      setLoading(true);
      const convos = await getConversations(user.uid);
      setConversations(convos);
    } catch (error) {
      console.error('[ScoutConversationList] Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (!user?.uid) return;
    
    try {
      await deleteConversation(user.uid, conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      setDeleteConfirmId(null);
      
      // If deleting current conversation, start new one
      if (conversationId === currentConversationId) {
        onNewConversation();
      }
    } catch (error) {
      console.error('[ScoutConversationList] Failed to delete conversation:', error);
    }
  };

  const handleEditSave = async (conversationId: string) => {
    if (!user?.uid || !editTitle.trim()) return;
    
    try {
      await updateConversationTitle(user.uid, conversationId, editTitle.trim());
      setConversations(prev => 
        prev.map(c => 
          c.id === conversationId 
            ? { ...c, title: editTitle.trim() } 
            : c
        )
      );
      setEditingId(null);
    } catch (error) {
      console.error('[ScoutConversationList] Failed to update title:', error);
    }
  };

  const formatDate = (timestamp: any) => {
    const date = timestamp?.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="p-5 border-b border-gray-200">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 
                     bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                     transition-colors text-base font-medium"
        >
          <Plus size={20} />
          New Chat
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-500 text-base">
            Loading conversations...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-base">
            No conversations yet. Start a new chat!
          </div>
        ) : (
          <div className="py-3">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group relative px-4 py-3 mx-3 rounded-lg cursor-pointer
                           transition-colors ${
                             conversation.id === currentConversationId
                               ? 'bg-blue-100 border border-blue-200'
                               : 'hover:bg-gray-100'
                           }`}
                onClick={() => onSelectConversation(conversation)}
              >
                {/* Edit Mode */}
                {editingId === conversation.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border rounded"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(conversation.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditSave(conversation.id);
                      }}
                      className="p-1 text-green-600 hover:bg-green-100 rounded"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      className="p-1 text-gray-500 hover:bg-gray-200 rounded"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : deleteConfirmId === conversation.id ? (
                  /* Delete Confirmation */
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-red-600">Delete?</span>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(conversation.id);
                        }}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                      >
                        Yes
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(null);
                        }}
                        className="px-2 py-1 text-xs bg-gray-300 rounded"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal View */
                  <>
                    <div className="flex items-start gap-3">
                      <MessageSquare 
                        size={18} 
                        className="mt-1 text-gray-400 flex-shrink-0" 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-base text-gray-900 truncate">
                          {conversation.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate mt-1">
                          {conversation.lastMessage || 'No messages'}
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                          <Clock size={13} />
                          {formatDate(conversation.updatedAt)}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons (visible on hover) */}
                    <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTitle(conversation.title);
                          setEditingId(conversation.id);
                        }}
                        className="p-1 text-gray-500 hover:bg-gray-200 rounded"
                        title="Edit title"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(conversation.id);
                        }}
                        className="p-1 text-gray-500 hover:bg-red-100 hover:text-red-600 rounded"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
