import { emptyState, type AppState, type Job } from './types';
export function sampleState(): AppState {
 const state=emptyState('Alex Morgan','alex@example.com');
 state.profile={...state.profile,headline:'Product Designer',roles:'Product Designer, UX Designer',skills:'Figma, Product design, Research, Prototyping, Design systems',location:'Chicago, IL',experience:'4 years',onboardingComplete:true};
 const today=new Date(); const date=(n:number)=>new Date(today.getTime()-n*86400000).toISOString();
 state.jobs=[
 {id:'sample-1',title:'Senior Product Designer',company:'Forma',location:'San Francisco, CA',workplace:'Remote',salary:'$145k – $180k',tags:['Figma','Product design','Design systems'],description:'Sample opportunity. Shape intuitive products with a collaborative design team. Lead discovery, prototyping, and the evolution of a thoughtful design system. This is example data, not a live vacancy.'},
 {id:'sample-2',title:'Product Designer, Growth',company:'Orbit',location:'New York, NY',workplace:'Hybrid',salary:'$130k – $165k',tags:['Research','Prototyping','Product design'],description:'Sample opportunity. Partner with product and engineering to simplify onboarding, test new ideas, and help customers discover value. This is example data, not a live vacancy.'},
 {id:'sample-3',title:'UX / UI Designer',company:'Layers',location:'Austin, TX',workplace:'Remote',salary:'$110k – $145k',tags:['Figma','Research','Interaction design'],description:'Sample opportunity. Turn complex workflows into clear, accessible interfaces. Collaborate with researchers and engineers. This is example data, not a live vacancy.'},
 {id:'sample-4',title:'Design Systems Designer',company:'Northstar',location:'Chicago, IL',workplace:'Hybrid',salary:'$125k – $155k',tags:['Figma','Design systems','Accessibility'],description:'Sample opportunity. Build and maintain a system of reusable components, patterns, and guidelines. This is example data, not a live vacancy.'}
 ].map((j,i)=>({...j,url:'',saved:i===0,source:'Sample',addedAt:date(i)}) as Job);
 state.applications=Array.from({length:12},(_,i)=>({id:`sample-app-${i}`,jobId:state.jobs[i%4].id,title:state.jobs[i%4].title,company:state.jobs[i%4].company,status:(['Applied','Applied','Interview','In review','Applied','Ready to apply','Applied','Offer','Applied','Saved','Applied','Applied'] as const)[i],notes:'Example application. Replace this with your own search.',date:date(i%7),nextStep:'',history:[{status:'Applied',date:date(i%7)}]}));
 state.demoLoaded=true;
 return state;
}
