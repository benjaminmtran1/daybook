/** Use the build's base, never a user-supplied redirect or a stale Pages URL. */
export function authRedirect(origin:string,base:string){return new URL(base,origin).href;}
