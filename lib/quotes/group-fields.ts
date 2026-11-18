// Columns a caller may set on a travel group. quote_id comes from the URL;
// id, nights and the timestamps are the database's.
export const EDITABLE_GROUP_FIELDS = [
  'group_name', 'num_participants', 'arrival_date', 'departure_date',
  'flight_price', 'room_type', 'room_price_per_night', 'accommodation_total',
  'flight_total', 'viaticos_type', 'viaticos_amount', 'viaticos_total',
  'viaticos_display_amount',
] as const;
