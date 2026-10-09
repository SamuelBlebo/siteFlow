// Joining from an invitation link, as a new team member does: the token is the end of the link
import { acceptInvite } from '../src/lib/account';

export const tokenOf = (res) => res.link.split('/invite/')[1];
export async function join(res, password) {
  await acceptInvite({ token: tokenOf(res), password });
  return password;
}
