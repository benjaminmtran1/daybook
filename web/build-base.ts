/** Custom-domain deployment defaults to root; Pages rollback is an explicit build choice. */
export function daybookBasePath(value:string|undefined):string{
 const base=value||'/';
 if(!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))throw Error('DAYBOOK_BASE_PATH must be / or an absolute path ending with / (for example /daybook/).');
 return base;
}
