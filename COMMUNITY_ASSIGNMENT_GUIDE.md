# Community Assignment Guide

## How to Assign Users to Growth Communities

### Understanding the Community Filter

When assigning roles in the FNE LMS, communities are **filtered by the selected school**. This means:

1. **If a school is selected**: Only communities belonging to that school will appear
2. **If no school is selected**: All communities across all schools will be visible

### Step-by-Step Guide

#### To Assign a User to Any Community:

1. **Open Role Assignment Modal**
   - Go to User Management
   - Click "Gestionar Roles" for the user

2. **Clear School Selection (Important!)**
   - In the "Colegio" dropdown, select the first option (empty/no selection)
   - This will show ALL communities in the system

3. **Select the Community**
   - The "Comunidad de Crecimiento" dropdown will now show all available communities
   - Choose the desired community

4. **Save the Assignment**
   - Click "Asignar Rol" or "Actualizar Rol"

#### To See Communities for a Specific School:

1. **Select the School First**
   - Choose a school from the "Colegio" dropdown
   - The community dropdown will update to show only communities for that school

2. **If No Communities Appear**
   - This means the selected school has no communities yet
   - Either create a community for that school, or
   - Clear the school selection to see communities from other schools

### Common Issues

#### "No communities showing in dropdown"
- **Cause**: A school is selected that has no communities
- **Solution**: Clear the school selection or select a different school

#### "Can't find a specific community"
- **Cause**: The community belongs to a different school than the one selected
- **Solution**: Clear the school selection to see all communities

#### "Communities not updating when I change schools"
- **Cause**: The dropdown should update automatically
- **Solution**: If it doesn't, close and reopen the modal

### Technical Note

Communities are stored with a `school_id` that links them to their parent school. When a school is selected in the role assignment modal, the system filters communities to show only those belonging to that school. This is intentional to help organize communities by school, but you can always clear the school filter to see all communities.