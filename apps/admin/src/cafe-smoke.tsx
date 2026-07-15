import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

sessionStorage.setItem('admin_secret', 'local-smoke')
const cafes = [
  { id:'1', slug:'knot-coffee', name:'Knot Coffee', venue_type:'cafe', address:'Türkenstr. 12', city:'Munich', area:'Maxvorstadt', description:'A meeting-friendly coffee shop.', perk_text:'10% off', photo_url:null, hours_text:'Daily 8–20', lat:48.15, lng:11.58, is_partnered:true, is_active:true, deal_title:'Member coffee', deal_details:'Ten percent off drinks.', deal_code:'KNOTIFY10', deal_code_enabled:true, featured_priority:10, archived_at:null },
  { id:'2', slug:'westend-table', name:'Westend Table', venue_type:'restaurant', address:'Landsberger Str. 21', city:'Munich', area:'Westend', description:'Neighborhood restaurant.', perk_text:null, photo_url:null, hours_text:'Tue–Sun', lat:null, lng:null, is_partnered:false, is_active:true, deal_title:null, deal_details:null, deal_code:null, deal_code_enabled:false, featured_priority:0, archived_at:null },
]
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const path = new URL(url, location.origin).pathname
  const json = (value: unknown, status=200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}})
  if (path === '/api/admin-panel/stats') return json({total:0,pending:0,approved:0,rejected:0})
  if (path === '/api/admin-panel/beta-signups') return json({signups:[]})
  if (path === '/api/admin-panel/cafes' && (!init?.method || init.method === 'GET')) return json({cafes})
  if (path.startsWith('/api/admin-panel/')) return json({ok:true,cafe:cafes[0]})
  return json({error:'unexpected'},404)
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
