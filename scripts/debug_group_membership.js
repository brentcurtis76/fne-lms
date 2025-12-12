
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const USER_ID = '5d9c9102-82c1-4a67-819c-695ee6892abd';
const ASSIGNMENT_ID = '5c8082e1-5215-41db-b202-74ca5fc1b294';
const GROUP_ID = 'c05522af-5627-445b-b9bc-c6d52110e84b';

async function debugMembership() {
    console.log('Debugging Group Membership...');
    console.log(`User ID: ${USER_ID}`);
    console.log(`Assignment ID: ${ASSIGNMENT_ID}`);
    console.log(`Group ID: ${GROUP_ID}`);

    // 1. Check specific membership
    const { data: membership, error: membershipError } = await supabase
        .from('group_assignment_members')
        .select('*')
        .eq('user_id', USER_ID)
        .eq('group_id', GROUP_ID)
        .eq('assignment_id', ASSIGNMENT_ID);

    if (membershipError) {
        console.error('Error querying membership:', membershipError);
    } else {
        console.log('Specific Membership Record:', membership);
    }

    // 2. Check any membership for this user and assignment (maybe different group?)
    const { data: anyGroup, error: anyGroupError } = await supabase
        .from('group_assignment_members')
        .select('*')
        .eq('user_id', USER_ID)
        .eq('assignment_id', ASSIGNMENT_ID);

    if (anyGroupError) {
        console.error('Error querying any group for user/assignment:', anyGroupError);
    } else {
        console.log('Any Group for User/Assignment:', anyGroup);
    }

    // 3. Check any membership for this user and group (maybe different assignment?)
    const { data: anyAssignment, error: anyAssignmentError } = await supabase
        .from('group_assignment_members')
        .select('*')
        .eq('user_id', USER_ID)
        .eq('group_id', GROUP_ID);

    if (anyAssignmentError) {
        console.error('Error querying any assignment for user/group:', anyAssignmentError);
    } else {
        console.log('Any Assignment for User/Group:', anyAssignment);
    }

    // 4. Check if the group exists
    const { data: group, error: groupError } = await supabase
        .from('group_assignment_groups')
        .select('*')
        .eq('id', GROUP_ID);

    if (groupError) {
        console.error('Error querying group:', groupError);
    } else {
        console.log('Group Details:', group);
    }
}

debugMembership();
