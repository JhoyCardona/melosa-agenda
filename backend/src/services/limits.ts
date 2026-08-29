// Free-text field length caps, shared by the public and admin order endpoints.
// Generous enough that a real client/admin never bumps into them, tight enough
// to keep the DB (and the JSON body) from absorbing arbitrary junk — there was
// previously no cap at all on these three fields.
export const MAX_CLIENT_NAME_LENGTH = 120;
export const MAX_NOTES_LENGTH = 500;
export const MAX_ADDRESS_LENGTH = 300;
