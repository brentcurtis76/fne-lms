#!/bin/bash

# Script to safely create learning path search indexes
# This handles the CONCURRENTLY limitation by running each index separately

echo "Learning Path Search Indexes Creation Script"
echo "============================================="
echo ""

# Check if DATABASE_URL is provided
if [ -z "$1" ]; then
    echo "Usage: ./scripts/create-indexes.sh DATABASE_URL"
    echo "Example: ./scripts/create-indexes.sh postgres://user:pass@host/db"
    exit 1
fi

DATABASE_URL=$1

# Function to create an index
create_index() {
    local index_name=$1
    local index_command=$2
    
    echo -n "Creating $index_name... "
    
    # Check if index exists
    EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM pg_indexes WHERE indexname = '$index_name';" 2>/dev/null | grep -c 1)
    
    if [ "$EXISTS" -eq 1 ]; then
        echo "SKIPPED (already exists)"
        return 0
    fi
    
    # Create the index
    if psql "$DATABASE_URL" -c "$index_command" 2>/dev/null; then
        echo "SUCCESS"
        return 0
    else
        echo "FAILED (may already exist)"
        return 1
    fi
}

# Enable pg_trgm extension
echo "Enabling pg_trgm extension..."
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" 2>/dev/null

echo ""
echo "Creating indexes..."
echo ""

# Create each index
create_index "idx_user_roles_school_active" \
    "CREATE INDEX CONCURRENTLY idx_user_roles_school_active ON user_roles(school_id, is_active) WHERE is_active = true;"

create_index "idx_user_roles_community_active" \
    "CREATE INDEX CONCURRENTLY idx_user_roles_community_active ON user_roles(community_id, is_active) WHERE community_id IS NOT NULL AND is_active = true;"

create_index "idx_user_roles_user_school_active" \
    "CREATE INDEX CONCURRENTLY idx_user_roles_user_school_active ON user_roles(user_id, school_id, is_active) WHERE is_active = true;"

create_index "idx_cw_community_id" \
    "CREATE INDEX CONCURRENTLY idx_cw_community_id ON community_workspaces(community_id);"

create_index "idx_cw_name_trgm" \
    "CREATE INDEX CONCURRENTLY idx_cw_name_trgm ON community_workspaces USING gin(name gin_trgm_ops);"

create_index "idx_lpa_path_user" \
    "CREATE INDEX CONCURRENTLY idx_lpa_path_user ON learning_path_assignments(path_id, user_id) WHERE user_id IS NOT NULL;"

create_index "idx_lpa_path_group" \
    "CREATE INDEX CONCURRENTLY idx_lpa_path_group ON learning_path_assignments(path_id, group_id) WHERE group_id IS NOT NULL;"

create_index "idx_lpa_path_id_counts" \
    "CREATE INDEX CONCURRENTLY idx_lpa_path_id_counts ON learning_path_assignments(path_id) INCLUDE (user_id, group_id);"

create_index "idx_profiles_first_name_trgm" \
    "CREATE INDEX CONCURRENTLY idx_profiles_first_name_trgm ON profiles USING gin(first_name gin_trgm_ops);"

create_index "idx_profiles_last_name_trgm" \
    "CREATE INDEX CONCURRENTLY idx_profiles_last_name_trgm ON profiles USING gin(last_name gin_trgm_ops);"

create_index "idx_profiles_email_trgm" \
    "CREATE INDEX CONCURRENTLY idx_profiles_email_trgm ON profiles USING gin(email gin_trgm_ops);"

echo ""
echo "Updating table statistics..."
psql "$DATABASE_URL" -c "ANALYZE user_roles;" 2>/dev/null
psql "$DATABASE_URL" -c "ANALYZE community_workspaces;" 2>/dev/null
psql "$DATABASE_URL" -c "ANALYZE learning_path_assignments;" 2>/dev/null
psql "$DATABASE_URL" -c "ANALYZE profiles;" 2>/dev/null

echo ""
echo "Index creation complete!"
echo ""
echo "Verifying created indexes:"
psql "$DATABASE_URL" -c "SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%' ORDER BY tablename, indexname;"