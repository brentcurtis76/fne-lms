const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupConsultantTestAssignments() {
  console.log('Setting up consultant test assignments...\n');

  try {
    // Get a consultant user - check both English and Spanish terms
    let consultant = null;
    
    // Try 'consultor' first
    const { data: consultorData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'consultor')
      .limit(1)
      .single();
      
    if (consultorData) {
      consultant = consultorData;
    } else {
      // Try 'consultant'
      const { data: consultantData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'consultant')
        .limit(1)
        .single();
        
      consultant = consultantData;
    }
    
    // If still no consultant, check user_roles table
    if (!consultant) {
      const { data: consultorRole } = await supabase
        .from('user_roles')
        .select('*, profiles!inner(*)')
        .eq('role_type', 'consultor')
        .limit(1)
        .single();
        
      if (consultorRole) {
        consultant = consultorRole.profiles;
      }
    }

    if (!consultant) {
      console.log('No consultant found. Checking if test consultant exists...');
      
      // Check if the consultant exists by email
      const { data: existingConsultant } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', 'consultor.test@fne.org')
        .single();
        
      if (existingConsultant) {
        consultant = existingConsultant;
        // Update role if needed
        if (consultant.role !== 'consultor') {
          await supabase
            .from('profiles')
            .update({ role: 'consultor' })
            .eq('id', consultant.id);
          consultant.role = 'consultor';
        }
      } else {
        console.log('Creating a test consultant...');
        
        // Get the auth user first
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
          filter: `email.eq.consultor.test@fne.org`
        });
        
        let authUserId;
        if (users && users.length > 0) {
          authUserId = users[0].id;
        } else {
          // Create a test consultant user
          const { data: { user: authUser }, error: authError } = await supabase.auth.admin.createUser({
            email: 'consultor.test@fne.org',
            password: 'TestConsultor123!',
            email_confirm: true
          });
          
          if (authError) {
            console.error('Error creating auth user:', authError);
            return;
          }
          authUserId = authUser.id;
        }
        
        // Create profile
        const { data: newConsultant, error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authUserId,
            email: 'consultor.test@fne.org',
            first_name: 'Consultor',
            last_name: 'Test',
            role: 'consultor',
            approval_status: 'approved'
          })
          .select()
          .single();
          
        if (profileError) {
          console.error('Error creating profile:', profileError);
          return;
        }
        
        consultant = newConsultant;
        console.log('✅ Created test consultant:', consultant.email);
      }
    }

    console.log('Found consultant:', consultant.email);

    // Get some docente (student) users
    const { data: students } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'docente')
      .limit(3);

    if (!students || students.length === 0) {
      console.error('No docente (student) users found');
      return;
    }

    console.log(`Found ${students.length} students`);

    // Create consultant assignments for each student
    for (const student of students) {
      // Check if assignment already exists
      const { data: existing } = await supabase
        .from('consultant_assignments')
        .select('*')
        .eq('consultant_id', consultant.id)
        .eq('student_id', student.id)
        .eq('is_active', true)
        .single();

      if (existing) {
        console.log(`Assignment already exists for ${student.email}`);
        continue;
      }

      // Create consultant assignment
      const { data: assignment, error } = await supabase
        .from('consultant_assignments')
        .insert({
          consultant_id: consultant.id,
          student_id: student.id,
          assignment_type: 'monitoring',
          can_view_progress: true,
          can_assign_courses: false,
          can_message_student: true,
          is_active: true,
          assigned_by: consultant.id
        })
        .select()
        .single();

      if (error) {
        console.error(`Error creating assignment for ${student.email}:`, error);
      } else {
        console.log(`✅ Created assignment for ${student.email}`);
      }
    }

    // Now ensure at least one student has access to the course with group assignments
    const firstStudent = students[0];
    
    // Get the course with group assignment
    const { data: course } = await supabase
      .from('courses')
      .select('*')
      .eq('title', 'Fundamentos de Los Pellines')
      .single();

    if (course) {
      // Check if student already has course assignment
      const { data: existingCourse } = await supabase
        .from('course_assignments')
        .select('*')
        .eq('teacher_id', firstStudent.id)
        .eq('course_id', course.id)
        .single();

      if (!existingCourse) {
        // Create course assignment for the student
        const { error: courseError } = await supabase
          .from('course_assignments')
          .insert({
            teacher_id: firstStudent.id,
            course_id: course.id,
            assignment_type: 'individual',
            status: 'active',
            assigned_by: consultant.id
          });

        if (courseError) {
          console.error('Error assigning course to student:', courseError);
        } else {
          console.log(`✅ Assigned course to ${firstStudent.email}`);
        }
      }
    }

    console.log('\n✅ Setup complete!');
    console.log(`Consultant ${consultant.email} can now see group assignments for their assigned students in the collaborative workspace.`);

  } catch (error) {
    console.error('Failed:', error);
  }
}

setupConsultantTestAssignments();