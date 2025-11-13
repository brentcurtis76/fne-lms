import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../../../components/layout/MainLayout';
import { useAuth } from '../../../../../hooks/useAuth';
import { groupAssignmentService } from '../../../../../lib/services/groupAssignments';
import MessageComposer from '../../../../../components/messaging/MessageComposer';
import MessageCard from '../../../../../components/messaging/MessageCard';
import { ClipboardCheckIcon, ChatAlt2Icon, ArrowLeftIcon } from '@heroicons/react/outline';
import { sendMessage, subscribeToWorkspaceMessages } from '../../../../../utils/messagingUtils-simple';

export default function GroupDiscussionPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { id: assignmentId } = router.query;
  const { user, loading: authLoading, isAdmin, avatarUrl, logout } = useAuth();
  
  const [assignment, setAssignment] = useState<any>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [thread, setThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userGroup, setUserGroup] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && user && assignmentId) {
      loadData();
    } else if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, assignmentId]);

  useEffect(() => {
    if (!thread || !workspace) return;

    // Subscribe to real-time messages
    const unsubscribe = subscribeToWorkspaceMessages(workspace.id, {
      onMessage: (message) => {
        // Only add messages for this thread
        if (message.thread_id === thread.id) {
          setMessages(prev => [...prev, message]);
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe.unsubscribe();
    };
  }, [thread, workspace]);

  const loadData = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Load assignment details from blocks table
      const { data: blockData, error: assignmentError } = await supabase
        .from('blocks')
        .select(`
          *,
          lesson:lessons!lesson_id (
            id,
            title,
            course_id
          )
        `)
        .eq('id', assignmentId)
        .single();

      if (assignmentError) throw assignmentError;
      
      // Check if this is a group assignment block
      if (blockData.type !== 'group-assignment' && blockData.type !== 'group_assignment') {
        throw new Error('This is not a group assignment');
      }
      
      // Get the assignment from the view that admin page uses
      const { data: assignmentView } = await supabase
        .from('group_assignments_with_status')
        .select('*')
        .eq('id', assignmentId)
        .single();
      
      // If we can't get it from the view, construct it from block data
      let assignmentData = assignmentView;
      
      if (!assignmentData) {
        // Get community from user's current assignment
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('community_id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single();
          
        const communityId = userRole?.community_id;
        
        if (!communityId) {
          throw new Error('User does not have a community assigned');
        }
        
        // Load course details
        const { data: courseData } = await supabase
          .from('courses')
          .select('id, title')
          .eq('id', blockData.lesson.course_id)
          .single();
        
        // Load community details
        const { data: communityData } = await supabase
          .from('growth_communities')
          .select('id, name')
          .eq('id', communityId)
          .single();
        
        // Construct assignment data from block
        assignmentData = {
          id: blockData.id,
          block_id: blockData.id,
          lesson_id: blockData.lesson_id,
          lesson_title: blockData.lesson?.title,
          course_id: courseData?.id,
          course_title: courseData?.title,
          title: blockData.payload?.title || 'Tarea Grupal',
          description: blockData.payload?.instructions || blockData.payload?.description || '',
          instructions: blockData.payload?.instructions || '',
          resources: blockData.payload?.resources || [],
          community_id: communityId,
          community: communityData,
          course: courseData,
          lesson: blockData.lesson,
          created_at: blockData.created_at
        };
      }
      
      setAssignment(assignmentData);

      // Load workspace
      const communityId = assignmentData.community_id;
      const { data: workspaceData } = await supabase
        .from('community_workspaces')
        .select('*')
        .eq('community_id', communityId)
        .single();
          
      if (workspaceData) {
        setWorkspace(workspaceData);

        // Get user's group
        const { data: userGroupData } = await supabase
          .from('group_assignment_members')
          .select('*')
          .eq('assignment_id', assignmentId)
          .eq('user_id', user.id)
          .single();

        if (!userGroupData) {
          toast.error('No eres parte de ningún grupo para esta tarea');
          router.push('/mi-aprendizaje/tareas');
          return;
        }

        setUserGroup(userGroupData);

        // Get all group members
        const { data: members } = await supabase
          .from('group_assignment_members')
          .select(`
            *,
            user:profiles!user_id (
              id,
              name,
              email,
              avatar_url
            )
          `)
          .eq('group_id', userGroupData.group_id)
          .eq('assignment_id', assignmentId);

        setGroupMembers(members || []);

        // Get or create discussion thread
        const discussionThread = await groupAssignmentService.getOrCreateDiscussion(
          assignmentId as string,
          userGroupData.group_id,
          workspaceData.id,
          user.id
        );

        setThread(discussionThread);

        // Load messages
        const { data: threadMessages } = await supabase
          .from('community_messages')
          .select(`
            *,
            author:profiles!author_id (
              id,
              name,
              email,
              avatar_url
            ),
            attachments:message_attachments (*)
          `)
          .eq('thread_id', discussionThread.id)
          .order('created_at', { ascending: true });

        setMessages(threadMessages || []);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (messageData: any) => {
    if (!user || !thread || !workspace) return;

    try {
      await sendMessage(workspace.id, {
        ...messageData,
        thread_id: thread.id
      }, user.id);
      
      // Message will be added via real-time subscription
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Error al enviar el mensaje');
    }
  };

  const handleMentionRequest = (query: string) => {
    if (!groupMembers.length) return [];
    
    const filtered = groupMembers
      .filter(member => {
        const searchQuery = query.toLowerCase();
        return member.user?.name?.toLowerCase().includes(searchQuery) ||
               member.user?.email?.toLowerCase().includes(searchQuery);
      })
      .map(member => ({
        id: member.user_id,
        type: 'user' as const,
        display_name: member.user?.name || member.user?.email || 'Usuario',
        email: member.user?.email || '',
        avatar: member.user?.avatar_url || null
      }));

    return filtered.slice(0, 10);
  };

  if (authLoading || loading) {
    return (
      <MainLayout 
        user={user} 
        currentPage="workspace"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={logout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b]"></div>
        </div>
      </MainLayout>
    );
  }

  if (!assignment || !thread) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Discusión - {assignment.title} - FNE LMS</title>
      </Head>

      <MainLayout 
        user={user} 
        currentPage="workspace"
        pageTitle="Discusión del Grupo"
        breadcrumbs={[
          { label: 'Mis Tareas', href: '/mi-aprendizaje/tareas' },
          { label: assignment.title }
        ]}
        isAdmin={isAdmin}
        onLogout={logout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Back button */}
          <button
            onClick={() => router.push('/mi-aprendizaje/tareas')}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Volver a Tareas Grupales
          </button>

          {/* Assignment Header */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-[#00365b] mb-2">
                  Discusión: {assignment.title}
                </h1>
                <p className="text-gray-600">
                  {assignment.course?.title} - {assignment.lesson?.title}
                </p>
              </div>
              <ChatAlt2Icon className="w-8 h-8 text-gray-400" />
            </div>
          </div>

          {/* Group Members */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Miembros del grupo ({groupMembers.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {groupMembers.map(member => (
                <div 
                  key={member.id}
                  className="flex items-center space-x-2 bg-white px-3 py-1 rounded-full text-sm"
                >
                  {member.user?.avatar_url ? (
                    <img
                      src={member.user.avatar_url}
                      alt={member.user.name}
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-300"></div>
                  )}
                  <span className="text-gray-700">
                    {member.user?.name || member.user?.email}
                    {member.role === 'leader' && (
                      <span className="ml-1 text-xs text-[#fdb933]">(Líder)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Container */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Messages */}
            <div className="h-[500px] overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <ChatAlt2Icon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-500">
                    No hay mensajes aún. ¡Inicia la conversación!
                  </p>
                </div>
              ) : (
                messages.map(message => (
                  <MessageCard
                    key={message.id}
                    message={{
                      ...message,
                      author_name: message.author?.name || message.author?.email || 'Usuario',
                      author_avatar: message.author?.avatar_url
                    }}
                    currentUserId={user?.id || ''}
                    onReply={() => {}}
                    onReaction={() => {}}
                    onPreviewAttachment={() => {}}
                    permissions={{
                      can_edit_own_messages: message.author_id === user?.id,
                      can_delete_own_messages: message.author_id === user?.id,
                      can_send_messages: true,
                      can_view_messages: true,
                      can_create_threads: false,
                      can_moderate_messages: false,
                      can_pin_threads: false,
                      can_archive_threads: false,
                      can_upload_attachments: true,
                      can_mention_all: false,
                      can_view_analytics: false,
                      can_manage_reactions: true
                    }}
                  />
                ))
              )}
            </div>

            {/* Message Composer */}
            <div className="border-t border-gray-200">
              <MessageComposer
                workspaceId={workspace.id}
                threadId={thread.id}
                onSendMessage={handleSendMessage}
                mentionSuggestions={[]}
                onRequestMentions={handleMentionRequest}
                allowMentions={true}
              />
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}