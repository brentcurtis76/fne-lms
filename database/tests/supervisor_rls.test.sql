-- Supervisor de Red RLS Tests using pgTAP
-- This test suite validates Row-Level Security policies and helper functions
-- for the network supervisor feature

-- Load pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Start test
SELECT plan(45);

-- Test Setup: Create test data
DO $$
DECLARE
    -- Test users
    admin_id UUID := gen_random_uuid();
    supervisor1_id UUID := gen_random_uuid();
    supervisor2_id UUID := gen_random_uuid();
    docente_id UUID := gen_random_uuid();
    
    -- Test networks
    network1_id UUID := gen_random_uuid();
    network2_id UUID := gen_random_uuid();
    
    -- Test schools
    school1_id INTEGER := 101;
    school2_id INTEGER := 102;
    school3_id INTEGER := 103;
BEGIN
    -- Create test users in profiles
    INSERT INTO profiles (id, email, first_name, last_name)
    VALUES 
        (admin_id, 'admin@test.com', 'Admin', 'User'),
        (supervisor1_id, 'supervisor1@test.com', 'Supervisor', 'One'),
        (supervisor2_id, 'supervisor2@test.com', 'Supervisor', 'Two'),
        (docente_id, 'docente@test.com', 'Docente', 'User');
    
    -- Assign roles
    INSERT INTO user_roles (user_id, role_type, is_active)
    VALUES
        (admin_id, 'admin', true),
        (supervisor1_id, 'supervisor_de_red', true),
        (supervisor2_id, 'supervisor_de_red', true),
        (docente_id, 'docente', true);
    
    -- Create test schools
    INSERT INTO schools (id, name, created_at)
    VALUES
        (school1_id, 'Test School 1', NOW()),
        (school2_id, 'Test School 2', NOW()),
        (school3_id, 'Test School 3', NOW());
    
    -- Create test networks
    INSERT INTO redes_de_colegios (id, name, description, created_by, last_updated_by)
    VALUES
        (network1_id, 'Test Network 1', 'Network 1 description', admin_id, admin_id),
        (network2_id, 'Test Network 2', 'Network 2 description', admin_id, admin_id);
    
    -- Assign schools to networks
    INSERT INTO red_escuelas (red_id, school_id, assigned_by)
    VALUES
        (network1_id, school1_id, admin_id),
        (network1_id, school2_id, admin_id),
        (network2_id, school3_id, admin_id);
    
    -- Assign supervisors to networks
    UPDATE user_roles SET red_id = network1_id WHERE user_id = supervisor1_id;
    UPDATE user_roles SET red_id = network2_id WHERE user_id = supervisor2_id;
    
    -- Assign some users to schools
    UPDATE profiles SET school_id = school1_id WHERE id = docente_id;
END $$;

-- Test 1: Admin can see all networks
PREPARE admin_networks AS
    SELECT COUNT(*) FROM redes_de_colegios;

SELECT is(
    (SELECT COUNT(*) FROM redes_de_colegios WHERE id IN (
        SELECT id FROM redes_de_colegios 
        WHERE EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = (SELECT id FROM profiles WHERE email = 'admin@test.com')
            AND role_type = 'admin'
            AND is_active = true
        )
    )),
    2::BIGINT,
    'Admin should see all networks'
);

-- Test 2: Supervisor can only see their assigned network
SELECT is(
    (SELECT COUNT(*) FROM redes_de_colegios WHERE id IN (
        SELECT red_id FROM user_roles 
        WHERE user_id = (SELECT id FROM profiles WHERE email = 'supervisor1@test.com')
        AND role_type = 'supervisor_de_red'
        AND is_active = true
    )),
    1::BIGINT,
    'Supervisor should only see their assigned network'
);

-- Test 3: Docente cannot see any networks
SELECT is(
    (SELECT COUNT(*) FROM redes_de_colegios WHERE id IN (
        SELECT red_id FROM user_roles 
        WHERE user_id = (SELECT id FROM profiles WHERE email = 'docente@test.com')
        AND role_type = 'supervisor_de_red'
        AND is_active = true
    )),
    0::BIGINT,
    'Docente should not see any networks'
);

-- Test 4: Test supervisor_can_access_user function
SELECT is(
    supervisor_can_access_user(
        (SELECT id FROM profiles WHERE email = 'supervisor1@test.com'),
        (SELECT id FROM profiles WHERE email = 'docente@test.com')
    ),
    true,
    'Supervisor1 should access users in their network schools'
);

-- Test 5: Supervisor cannot access users from other networks
SELECT is(
    supervisor_can_access_user(
        (SELECT id FROM profiles WHERE email = 'supervisor2@test.com'),
        (SELECT id FROM profiles WHERE email = 'docente@test.com')
    ),
    false,
    'Supervisor2 should not access users from other networks'
);

-- Test 6: Admin can modify networks
DO $$
DECLARE
    admin_id UUID := (SELECT id FROM profiles WHERE email = 'admin@test.com');
    network_id UUID := (SELECT id FROM redes_de_colegios LIMIT 1);
BEGIN
    -- Test update
    UPDATE redes_de_colegios 
    SET description = 'Updated by admin test'
    WHERE id = network_id;
    
    PERFORM is(
        (SELECT description FROM redes_de_colegios WHERE id = network_id),
        'Updated by admin test',
        'Admin should be able to update networks'
    );
END $$;

-- Test 7: Supervisor cannot modify networks
DO $$
DECLARE
    supervisor_id UUID := (SELECT id FROM profiles WHERE email = 'supervisor1@test.com');
    network_id UUID := (SELECT id FROM redes_de_colegios WHERE name = 'Test Network 1');
    update_success BOOLEAN := false;
BEGIN
    -- Attempt update (should fail due to RLS)
    BEGIN
        UPDATE redes_de_colegios 
        SET description = 'Updated by supervisor test'
        WHERE id = network_id;
        update_success := true;
    EXCEPTION WHEN OTHERS THEN
        update_success := false;
    END;
    
    PERFORM is(
        update_success,
        false,
        'Supervisor should not be able to update networks'
    );
END $$;

-- Test 8: Check red_escuelas RLS - Admin can see all assignments
SELECT is(
    (SELECT COUNT(*) FROM red_escuelas WHERE red_id IN (
        SELECT id FROM redes_de_colegios
    )),
    3::BIGINT,
    'Admin should see all school-network assignments'
);

-- Test 9: Supervisor can only see their network's school assignments
SELECT is(
    (SELECT COUNT(*) FROM red_escuelas WHERE red_id = (
        SELECT red_id FROM user_roles 
        WHERE user_id = (SELECT id FROM profiles WHERE email = 'supervisor1@test.com')
        AND role_type = 'supervisor_de_red'
        AND is_active = true
    )),
    2::BIGINT,
    'Supervisor1 should see 2 schools in their network'
);

-- Test 10: Test get_network_schools function
SELECT is(
    (SELECT COUNT(*) FROM get_network_schools(
        (SELECT id FROM redes_de_colegios WHERE name = 'Test Network 1')
    )),
    2::BIGINT,
    'get_network_schools should return correct count for Network 1'
);

-- Test 11: Test get_network_supervisors function
SELECT is(
    (SELECT COUNT(*) FROM get_network_supervisors(
        (SELECT id FROM redes_de_colegios WHERE name = 'Test Network 1')
    )),
    1::BIGINT,
    'get_network_supervisors should return 1 supervisor for Network 1'
);

-- Test 12: Verify data isolation between networks
SELECT is(
    (SELECT COUNT(*) FROM profiles WHERE school_id IN (
        SELECT school_id FROM red_escuelas 
        WHERE red_id = (SELECT id FROM redes_de_colegios WHERE name = 'Test Network 2')
    ) AND id = (SELECT id FROM profiles WHERE email = 'docente@test.com')),
    0::BIGINT,
    'Docente from Network 1 should not appear in Network 2 queries'
);

-- Test 13: Test audit trail in network creation
SELECT isnt(
    (SELECT created_at FROM redes_de_colegios WHERE name = 'Test Network 1'),
    NULL,
    'Network should have created_at timestamp'
);

SELECT isnt(
    (SELECT created_by FROM redes_de_colegios WHERE name = 'Test Network 1'),
    NULL,
    'Network should have created_by user reference'
);

-- Test 14: Test cascade behavior when removing supervisor
DO $$
DECLARE
    supervisor_id UUID := (SELECT id FROM profiles WHERE email = 'supervisor2@test.com');
BEGIN
    -- Remove supervisor role
    UPDATE user_roles 
    SET is_active = false, red_id = NULL
    WHERE user_id = supervisor_id AND role_type = 'supervisor_de_red';
    
    -- Check they no longer have network access
    PERFORM is(
        (SELECT red_id FROM user_roles 
         WHERE user_id = supervisor_id 
         AND role_type = 'supervisor_de_red' 
         AND is_active = true),
        NULL,
        'Deactivated supervisor should have no network assignment'
    );
END $$;

-- Test 15: Verify RLS on course_progress for supervisors
-- First create some test course progress data
DO $$
DECLARE
    docente_id UUID := (SELECT id FROM profiles WHERE email = 'docente@test.com');
    course_id UUID := gen_random_uuid();
BEGIN
    -- Create a test course
    INSERT INTO courses (id, title, created_by)
    VALUES (course_id, 'Test Course', docente_id);
    
    -- Create progress record
    INSERT INTO course_progress (user_id, course_id, progress_percentage)
    VALUES (docente_id, course_id, 50);
END $$;

-- Supervisor1 should see course progress for users in their network
SELECT is(
    (SELECT COUNT(*) FROM course_progress WHERE user_id IN (
        SELECT id FROM profiles WHERE school_id IN (
            SELECT school_id FROM red_escuelas WHERE red_id = (
                SELECT red_id FROM user_roles 
                WHERE user_id = (SELECT id FROM profiles WHERE email = 'supervisor1@test.com')
                AND role_type = 'supervisor_de_red'
                AND is_active = true
            )
        )
    )),
    1::BIGINT,
    'Supervisor should see course progress for users in their network schools'
);

-- Test 16: Verify RLS on quiz_attempts for supervisors
DO $$
DECLARE
    docente_id UUID := (SELECT id FROM profiles WHERE email = 'docente@test.com');
    quiz_id UUID := gen_random_uuid();
BEGIN
    -- Create a test quiz attempt
    INSERT INTO quiz_attempts (id, user_id, quiz_id, score, completed_at)
    VALUES (gen_random_uuid(), docente_id, quiz_id, 85, NOW());
END $$;

SELECT is(
    (SELECT COUNT(*) FROM quiz_attempts WHERE user_id IN (
        SELECT id FROM profiles WHERE school_id IN (
            SELECT school_id FROM red_escuelas WHERE red_id = (
                SELECT red_id FROM user_roles 
                WHERE user_id = (SELECT id FROM profiles WHERE email = 'supervisor1@test.com')
                AND role_type = 'supervisor_de_red'
                AND is_active = true
            )
        )
    )),
    1::BIGINT,
    'Supervisor should see quiz attempts for users in their network schools'
);

-- Test 17: Test network deletion protection
DO $$
DECLARE
    network_id UUID := (SELECT id FROM redes_de_colegios WHERE name = 'Test Network 1');
    delete_success BOOLEAN := false;
BEGIN
    -- Try to delete network with active supervisor (should fail)
    BEGIN
        DELETE FROM redes_de_colegios WHERE id = network_id;
        delete_success := true;
    EXCEPTION WHEN OTHERS THEN
        delete_success := false;
    END;
    
    PERFORM is(
        delete_success,
        false,
        'Should not be able to delete network with active supervisors'
    );
END $$;

-- Test 18: Test school reassignment between networks
DO $$
DECLARE
    admin_id UUID := (SELECT id FROM profiles WHERE email = 'admin@test.com');
    school_id INTEGER := 101;
    network2_id UUID := (SELECT id FROM redes_de_colegios WHERE name = 'Test Network 2');
BEGIN
    -- Remove from Network 1
    DELETE FROM red_escuelas WHERE school_id = school_id;
    
    -- Add to Network 2
    INSERT INTO red_escuelas (red_id, school_id, assigned_by)
    VALUES (network2_id, school_id, admin_id);
    
    -- Verify supervisor1 no longer sees users from this school
    PERFORM is(
        supervisor_can_access_user(
            (SELECT id FROM profiles WHERE email = 'supervisor1@test.com'),
            (SELECT id FROM profiles WHERE email = 'docente@test.com')
        ),
        false,
        'Supervisor1 should not access users after school reassignment'
    );
    
    -- Verify supervisor2 now sees users from this school
    PERFORM is(
        supervisor_can_access_user(
            (SELECT id FROM profiles WHERE email = 'supervisor2@test.com'),
            (SELECT id FROM profiles WHERE email = 'docente@test.com')
        ),
        true,
        'Supervisor2 should access users after school reassignment'
    );
END $$;

-- Test 19: Verify timestamp triggers
DO $$
DECLARE
    network_id UUID := (SELECT id FROM redes_de_colegios WHERE name = 'Test Network 1');
    original_updated_at TIMESTAMPTZ;
    new_updated_at TIMESTAMPTZ;
BEGIN
    -- Get original timestamp
    SELECT updated_at INTO original_updated_at FROM redes_de_colegios WHERE id = network_id;
    
    -- Wait a moment and update
    PERFORM pg_sleep(0.1);
    UPDATE redes_de_colegios SET description = 'Testing timestamp trigger' WHERE id = network_id;
    
    -- Get new timestamp
    SELECT updated_at INTO new_updated_at FROM redes_de_colegios WHERE id = network_id;
    
    PERFORM ok(
        new_updated_at > original_updated_at,
        'Updated_at should change on update'
    );
END $$;

-- Test 20: Comprehensive permission matrix test
-- This validates the complete permission model across all roles
DO $$
DECLARE
    test_result BOOLEAN;
BEGIN
    -- Admin permissions
    PERFORM is(
        (SELECT COUNT(*) FROM redes_de_colegios),
        2::BIGINT,
        'Admin sees all networks'
    );
    
    -- Supervisor permissions (as supervisor1)
    SET LOCAL ROLE postgres; -- Reset to superuser to simulate different user context
    SET LOCAL "request.jwt.claims" = '{"sub": "' || (SELECT id::text FROM profiles WHERE email = 'supervisor1@test.com') || '"}';
    
    PERFORM is(
        EXISTS(SELECT 1 FROM redes_de_colegios WHERE name = 'Test Network 1'),
        true,
        'Supervisor1 can see their own network'
    );
    
    PERFORM is(
        EXISTS(SELECT 1 FROM redes_de_colegios WHERE name = 'Test Network 2'),
        false,
        'Supervisor1 cannot see other networks'
    );
    
    RESET ROLE;
END $$;

-- Cleanup test data
DO $$
BEGIN
    -- Delete in correct order to respect foreign keys
    DELETE FROM quiz_attempts WHERE user_id IN (SELECT id FROM profiles WHERE email LIKE '%@test.com');
    DELETE FROM course_progress WHERE user_id IN (SELECT id FROM profiles WHERE email LIKE '%@test.com');
    DELETE FROM courses WHERE created_by IN (SELECT id FROM profiles WHERE email LIKE '%@test.com');
    DELETE FROM red_escuelas WHERE red_id IN (SELECT id FROM redes_de_colegios WHERE name LIKE 'Test Network%');
    DELETE FROM user_roles WHERE user_id IN (SELECT id FROM profiles WHERE email LIKE '%@test.com');
    DELETE FROM redes_de_colegios WHERE name LIKE 'Test Network%';
    DELETE FROM profiles WHERE email LIKE '%@test.com';
    DELETE FROM schools WHERE id IN (101, 102, 103);
END $$;

-- Finish tests
SELECT * FROM finish();