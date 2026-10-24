/** Public-only calendar contract. Provider credentials must never enter workspace data. */
export type CalendarProvider = 'google' | 'icloud';
export type CalendarRef = {connectionId:string;provider:CalendarProvider;calendarId:string;name:string;writable:boolean;selected:boolean};
export type CalendarEvent = {id:string;calendar:CalendarRef;title:string;start:string;end:string;allDay:boolean;originalUrl?:string};
export type CalendarDraft = {title:string;start:string;end:string;timeZone:string};
export const calendarProviders = [
 {id:'google' as const,name:'Google Calendar',description:'Read selected calendars and explicitly add events to calendars you own. Requires a separate Google Calendar authorization, not just Google sign-in.'},
 {id:'icloud' as const,name:'iCloud Calendar',description:'Live iCloud calendar access uses a secure server connection. Apple Calendar can also show other providers; those accounts must be connected separately.'},
];
export function validateCalendarDraft(input:CalendarDraft):CalendarDraft {
 if(!input.title.trim()||input.title.length>500)throw Error('Enter an event title up to 500 characters.');
 // Require an explicit offset: local wall times are ambiguous at daylight-saving transitions.
 const instant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
 const validDate=(value:string)=>{const day=value.slice(0,10);const d=new Date(day+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day;};
 if(!instant.test(input.start)||!instant.test(input.end)||!validDate(input.start)||!validDate(input.end)||!Number.isFinite(Date.parse(input.start))||!Number.isFinite(Date.parse(input.end))||Date.parse(input.end)<=Date.parse(input.start))throw Error('Choose valid start and end instants with a timezone offset.');
 try{new Intl.DateTimeFormat('en',{timeZone:input.timeZone}).format();}catch{throw Error('Choose a valid IANA timezone.');}
 return {...input,title:input.title.trim()};
}
export function validateSelection(ref:CalendarRef,connectionId:string,provider:CalendarProvider,write=false){
 if(ref.connectionId!==connectionId||ref.provider!==provider||!ref.selected||!ref.calendarId)throw Error('Choose a selected calendar from this connection.');
 if(write&&!ref.writable)throw Error('This calendar is read-only.');
}
