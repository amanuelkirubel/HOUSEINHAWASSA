(function(){
  const API = '';
  let state = {
    view:'home', currentUser:null, listings:[], cities:[],
    selectedId:null,
    filters:{ city:'', minPrice:'', maxPrice:'', bedrooms:'' },
    authMode:'login', authRole:'buyer', authError:'', sellError:'',
    activeThread:null, threadMsgs:[], inboxThreads:[],
    toast:'', loading:true,
  };

  function setState(patch){ state = Object.assign({}, state, patch); render(); }
  function token(){ return localStorage.getItem('yebet_token'); }

  async function api(path, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    if(token()) headers['Authorization'] = 'Bearer ' + token();
    const res = await fetch(API+path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  function fmtPrice(n){ return Number(n).toLocaleString('en-US') + ' ETB'; }
  function timeAgo(ts){
    const d = Date.now()-new Date(ts).getTime();
    const h = Math.floor(d/3600000);
    if(h<1) return 'just now';
    if(h<24) return h+'h ago';
    return Math.floor(h/24)+'d ago';
  }
  function tibeb(){
    let s=''; for(let i=0;i<60;i++){ s += '<span class="tri '+(i%2===0?'up':'down')+'"></span>'; }
    return '<div class="tibeb">'+s+'</div>';
  }
  function initials(name){ return (name||'?').slice(0,2).toUpperCase(); }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function showToast(msg){ setState({toast:msg}); setTimeout(()=>setState({toast:''}), 2600); }

  async function loadListings(){
    const params = new URLSearchParams();
    if(state.filters.city) params.set('city', state.filters.city);
    if(state.filters.minPrice) params.set('minPrice', state.filters.minPrice);
    if(state.filters.maxPrice) params.set('maxPrice', state.filters.maxPrice);
    if(state.filters.bedrooms) params.set('bedrooms', state.filters.bedrooms);
    const data = await api('/api/listings?'+params.toString());
    setState({ listings:data.listings, cities:data.cities, loading:false });
  }

  async function tryRestoreSession(){
    if(!token()) return;
    try{ const data = await api('/api/auth/me'); setState({ currentUser:data.user }); }
    catch(e){ localStorage.removeItem('yebet_token'); }
  }

  async function doLogin(username, password){
    try{
      const data = await api('/api/auth/login', { method:'POST', body: JSON.stringify({username,password}) });
      localStorage.setItem('yebet_token', data.token);
      setState({ currentUser:data.user, view:'home', authError:'' });
      showToast('Welcome back, '+username+'.');
    }catch(e){ setState({ authError: e.message }); }
  }

  async function doSignup(username, password, role, phone, city){
    try{
      const data = await api('/api/auth/signup', { method:'POST', body: JSON.stringify({username,password,role,phone,city}) });
      localStorage.setItem('yebet_token', data.token);
      setState({ currentUser:data.user, view:'home', authError:'' });
      showToast('Account created. Welcome, '+username+'.');
    }catch(e){ setState({ authError: e.message }); }
  }

  function doLogout(){ localStorage.removeItem('yebet_token'); setState({ currentUser:null, view:'home' }); }

  async function createListing(payload){
    try{
      await api('/api/listings', { method:'POST', body: JSON.stringify(payload) });
      await loadListings();
      setState({ view:'home', sellError:'' });
      showToast('Your listing is live.');
    }catch(e){ setState({ sellError: e.message }); }
  }

  async function openThread(listingId, buyer, listingTitle){
    try{
      const data = await api('/api/messages/'+listingId+'/'+encodeURIComponent(buyer));
      setState({ activeThread:{listingId, buyer, listingTitle: listingTitle||data.listingTitle}, threadMsgs:data.messages });
    }catch(e){ showToast(e.message); }
  }

  async function sendMessage(text){
    if(!text.trim() || !state.activeThread) return;
    const { listingId, buyer } = state.activeThread;
    try{
      await api('/api/messages/'+listingId+'/'+encodeURIComponent(buyer), { method:'POST', body: JSON.stringify({text}) });
      await openThread(listingId, buyer, state.activeThread.listingTitle);
      await loadInbox(false);
    }catch(e){ showToast(e.message); }
  }

  async function loadInbox(openFirst=true){
    try{
      const data = await api('/api/inbox');
      const mine = data.threads.map(t=>({
        listingId:t.listing_id, buyer:t.buyer_username, listingTitle:t.listing_title,
        isSeller: t.seller_username === state.currentUser.username
      }));
      setState({ inboxThreads: mine });
      if(openFirst && mine.length) openThread(mine[0].listingId, mine[0].buyer, mine[0].listingTitle);
    }catch(e){ showToast(e.message); }
  }

  // ---------- render (same visual structure as the demo) ----------
  function renderNav(){
    const u = state.currentUser;
    return `
    <div class="navbar"><div class="wrap navrow">
      <div class="brand" data-action="go-home"><span class="en display">YeBet</span><span class="am">የቤት · house marketplace</span></div>
      <div class="navlinks">
        ${u ? `
          ${u.role==='seller' ? `<button class="btn btn-ghost btn-sm" data-action="go-sell">+ List a house</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-action="go-inbox">Messages</button>
          <span class="pill">${u.username} · ${u.role}</span>
          <button class="btn btn-ghost btn-sm" data-action="logout">Log out</button>
        ` : `
          <button class="btn btn-ghost btn-sm" data-action="go-login">Log in</button>
          <button class="btn btn-gold btn-sm" data-action="go-signup">Sign up</button>
        `}
      </div>
    </div>${tibeb()}</div>`;
  }

  function renderSkyline(){
    return `<svg class="skyline" viewBox="0 0 400 70" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="30" width="18" height="40" fill="#3A3227"/><rect x="22" y="15" width="14" height="55" fill="#3A3227"/>
      <polygon points="45,70 55,45 65,70" fill="#3A3227"/><rect x="80" y="25" width="16" height="45" fill="#3A3227"/>
      <rect x="100" y="5" width="20" height="65" fill="#3A3227"/><polygon points="130,70 140,42 150,70" fill="#3A3227"/>
      <rect x="170" y="20" width="18" height="50" fill="#3A3227"/><polygon points="200,70 212,40 224,70" fill="#3A3227"/>
      <rect x="240" y="10" width="22" height="60" fill="#3A3227"/><rect x="270" y="30" width="16" height="40" fill="#3A3227"/>
      <polygon points="310,70 320,45 330,70" fill="#3A3227"/><rect x="350" y="18" width="18" height="52" fill="#3A3227"/>
      <rect x="375" y="35" width="14" height="35" fill="#3A3227"/></svg>`;
  }

  function renderHome(){
    const f = state.filters;
    const cities = state.cities.length ? state.cities : [];
    return `
    <div class="hero"><div class="wrap" style="position:relative;z-index:1;">
      <div class="hero-eyebrow">Ethiopia, house by house</div>
      <h1>Find a bet you can actually see yourself in.</h1>
      <p>Browse homes for sale across Ethiopia and message the seller directly, no agent required.</p>
      <div class="searchbar">
        <div class="field"><label>City</label><select data-filter="city"><option value="">All cities</option>${cities.map(c=>`<option value="${c}" ${f.city===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Min price (ETB)</label><input type="number" data-filter="minPrice" value="${f.minPrice}"></div>
        <div class="field"><label>Max price (ETB)</label><input type="number" data-filter="maxPrice" value="${f.maxPrice}"></div>
        <div class="field"><label>Bedrooms</label><select data-filter="bedrooms"><option value="">Any</option>${[1,2,3,4].map(n=>`<option value="${n}" ${f.bedrooms==String(n)?'selected':''}>${n}+</option>`).join('')}</select></div>
        <div class="field" style="align-self:end;"><button class="btn btn-gold btn-block" data-action="clear-filters">Clear</button></div>
      </div>
    </div>${renderSkyline()}</div>
    <div class="wrap section">
      <div class="section-head"><h2>Listings</h2><span class="count">${state.listings.length} house${state.listings.length===1?'':'s'}</span></div>
      ${state.listings.length ? `<div class="grid">${state.listings.map(renderCard).join('')}</div>` :
        `<div class="empty"><h3>No houses match those filters</h3><p>Try widening the price range or choosing a different city.</p></div>`}
    </div>`;
  }

  function renderCard(l){
    return `<div class="card" data-action="open-listing" data-id="${l.id}">
      <div class="card-img">${l.icon||'🏠'}</div>
      <div class="card-body">
        <div class="card-city">${l.city}</div>
        <div class="card-title">${escapeHtml(l.title)}</div>
        <div class="card-price mono">${fmtPrice(l.price)}</div>
        <div class="card-stats"><span>${l.bedrooms} bd</span><span>·</span><span>${l.bathrooms} ba</span><span>·</span><span>${l.area} m²</span></div>
      </div></div>`;
  }

  async function renderDetail(){
    let l = state.listings.find(x=>String(x.id)===String(state.selectedId));
    if(!l){ try{ const d = await api('/api/listings/'+state.selectedId); l = d.listing; }catch(e){} }
    if(!l) return `<div class="wrap section"><div class="empty"><h3>Listing not found</h3></div></div>`;
    const u = state.currentUser;
    const isOwner = u && u.username===l.seller_username;
    return `<div class="wrap section">
      <a class="back" data-action="go-home">&larr; Back to listings</a>
      <div class="detail-grid">
        <div>
          <div class="detail-img">${l.icon||'🏠'}</div>
          <div class="card-city">${l.city}</div>
          <h1 style="font-size:28px;color:var(--paper);margin-top:4px;">${escapeHtml(l.title)}</h1>
          <div class="detail-stats">
            <div class="stat"><b>${l.bedrooms}</b><span>Bedrooms</span></div>
            <div class="stat"><b>${l.bathrooms}</b><span>Bathrooms</span></div>
            <div class="stat"><b>${l.area} m²</b><span>Area</span></div>
          </div>
          <div class="desc">${escapeHtml(l.description || 'No description provided yet.')}</div>
        </div>
        <div class="side-card">
          <div class="side-price mono">${fmtPrice(l.price)}</div>
          <div style="color:var(--muted);font-size:13px;">Listed ${timeAgo(l.created_at)}</div>
          <div class="seller-row"><div class="avatar">${initials(l.seller_username)}</div>
            <div><div style="color:var(--paper);font-size:14px;font-weight:600;">${l.seller_username}</div><div style="color:var(--muted);font-size:12px;">Seller</div></div></div>
          ${isOwner ? `<div class="pill" style="display:block;text-align:center;">This is your listing</div>` :
            u ? `<button class="btn btn-gold btn-block" data-action="message-seller" data-id="${l.id}" data-title="${escapeHtml(l.title)}">Message seller</button>` :
            `<button class="btn btn-gold btn-block" data-action="go-login">Log in to message seller</button>`}
        </div>
      </div></div>`;
  }

  function renderAuth(){
    const signup = state.authMode==='signup';
    const cities = state.cities.length ? state.cities : ["Addis Ababa","Hawassa","Bahir Dar","Mekelle","Adama","Dire Dawa","Gondar","Jimma"];
    return `<div class="wrap"><div class="authbox">
      <h2>${signup? 'Create your account':'Log in'}</h2>
      <p class="sub">${signup? 'Join as a buyer to message sellers, or a seller to list houses.' : 'Welcome back to YeBet.'}</p>
      <form data-form="auth">
        ${signup? `<div class="role-toggle">
          <div class="role-opt ${state.authRole==='buyer'?'active':''}" data-action="set-role" data-role="buyer">I'm buying</div>
          <div class="role-opt ${state.authRole==='seller'?'active':''}" data-action="set-role" data-role="seller">I'm selling</div>
        </div>` : ''}
        <div class="formrow"><label>Username</label><input name="username" required></div>
        <div class="formrow"><label>Password</label><input name="password" type="password" required></div>
        ${signup? `<div class="formrow"><label>Phone (optional)</label><input name="phone" placeholder="+251 ..."></div>
        <div class="formrow"><label>City</label><select name="city"><option value="">Select city</option>${cities.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>` : ''}
        <button class="btn btn-gold btn-block" type="submit">${signup?'Create account':'Log in'}</button>
        ${state.authError? `<div class="error">${escapeHtml(state.authError)}</div>`:''}
      </form>
      <div class="switch-link">${signup? `Already have an account? <a href="#" data-action="go-login">Log in</a>` : `New here? <a href="#" data-action="go-signup">Create an account</a>`}</div>
    </div></div>`;
  }

  function renderSell(){
    const cities = state.cities.length ? state.cities : ["Addis Ababa","Hawassa","Bahir Dar","Mekelle","Adama","Dire Dawa","Gondar","Jimma"];
    return `<div class="wrap section">
      <a class="back" data-action="go-home">&larr; Back to listings</a>
      <h2 style="color:var(--paper);margin-bottom:4px;">List your house</h2>
      <p style="color:var(--muted);margin-bottom:22px;">This goes live for every visitor to browse and message you about.</p>
      <form class="sell-form" data-form="sell">
        <div class="formrow"><label>Title</label><input name="title" placeholder="e.g. 2BR home near Piassa" required></div>
        <div class="form-2col">
          <div class="formrow"><label>City</label><select name="city" required><option value="">Select city</option>${cities.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
          <div class="formrow"><label>Price (ETB)</label><input name="price" type="number" min="0" required></div>
        </div>
        <div class="form-2col">
          <div class="formrow"><label>Bedrooms</label><input name="bedrooms" type="number" min="0"></div>
          <div class="formrow"><label>Bathrooms</label><input name="bathrooms" type="number" min="0"></div>
        </div>
        <div class="formrow"><label>Area (m²)</label><input name="area" type="number" min="0"></div>
        <div class="formrow"><label>Description</label><textarea name="description" placeholder="Describe the house and the neighborhood."></textarea></div>
        <button class="btn btn-gold btn-block" type="submit">Publish listing</button>
        ${state.sellError? `<div class="error">${escapeHtml(state.sellError)}</div>`:''}
      </form></div>`;
  }

  function renderInbox(){
    const threads = state.inboxThreads;
    const active = state.activeThread;
    return `<div class="wrap section">
      <h2 style="color:var(--paper);margin-bottom:18px;">Messages</h2>
      ${!threads.length ? `<div class="empty"><h3>No conversations yet</h3><p>Message a seller from a listing page to start one.</p></div>` : `
      <div class="thread-layout">
        <div class="thread-list">${threads.map(t=>`
          <div class="thread-item ${active && String(active.listingId)===String(t.listingId) && active.buyer===t.buyer?'active':''}" data-action="select-thread" data-listing="${t.listingId}" data-buyer="${t.buyer}" data-title="${escapeHtml(t.listingTitle)}">
            <div class="tname">${escapeHtml(t.listingTitle)}</div>
            <div class="tsub">${t.isSeller? 'Buyer: '+t.buyer : 'You messaged the seller'}</div>
          </div>`).join('')}</div>
        <div class="thread-panel">
          <div class="msg-log">${state.threadMsgs.length ? state.threadMsgs.map(m=>`
            <div class="msg ${m.sender===state.currentUser.username?'mine':'theirs'}">${escapeHtml(m.text)}<div class="msg-time">${m.sender} · ${timeAgo(m.created_at)}</div></div>
          `).join('') : `<div style="color:var(--muted);margin:auto;">Say hello to start the conversation.</div>`}</div>
          <form class="msg-input" data-form="send-message"><input name="text" placeholder="Type a message..." autocomplete="off"><button class="btn btn-gold btn-sm" type="submit">Send</button></form>
        </div>
      </div>`}
    </div>`;
  }

  function renderFooter(){
    return `<div class="footer">${tibeb()}<div class="wrap" style="margin-top:16px;">YeBet — real accounts, real database. Built for Ethiopia.</div></div>`;
  }

  async function render(){
    const app = document.getElementById('app');
    if(state.loading){ app.innerHTML = renderNav() + `<div class="loadstate">Loading listings…</div>`; return; }
    let body = '';
    if(state.view==='home') body = renderHome();
    else if(state.view==='detail') body = await renderDetail();
    else if(state.view==='login' || state.view==='signup') body = renderAuth();
    else if(state.view==='sell') body = renderSell();
    else if(state.view==='inbox') body = renderInbox();
    app.innerHTML = renderNav() + body + renderFooter() + (state.toast? `<div class="toast">${escapeHtml(state.toast)}</div>` : '');
    attachEvents();
  }

  function attachEvents(){
    const app = document.getElementById('app');
    app.querySelectorAll('[data-action]').forEach(el=>{
      el.addEventListener('click', async (e)=>{
        e.preventDefault();
        const action = el.getAttribute('data-action');
        if(action==='go-home') setState({ view:'home' });
        else if(action==='go-login') setState({ view:'login', authMode:'login', authError:'' });
        else if(action==='go-signup') setState({ view:'signup', authMode:'signup', authError:'' });
        else if(action==='logout') doLogout();
        else if(action==='go-sell') setState({ view:'sell', sellError:'' });
        else if(action==='go-inbox'){ setState({ view:'inbox' }); await loadInbox(); }
        else if(action==='open-listing') setState({ view:'detail', selectedId: el.getAttribute('data-id') });
        else if(action==='clear-filters'){ setState({ filters:{city:'',minPrice:'',maxPrice:'',bedrooms:''} }); await loadListings(); }
        else if(action==='set-role') setState({ authRole: el.getAttribute('data-role') });
        else if(action==='message-seller'){
          const id = el.getAttribute('data-id'); const title = el.getAttribute('data-title');
          setState({ view:'inbox', inboxThreads:[{listingId:id, buyer:state.currentUser.username, listingTitle:title, isSeller:false}] });
          await openThread(id, state.currentUser.username, title);
        }
        else if(action==='select-thread') await openThread(el.getAttribute('data-listing'), el.getAttribute('data-buyer'), el.getAttribute('data-title'));
      });
    });
    app.querySelectorAll('[data-filter]').forEach(el=>{
      el.addEventListener('change', async ()=>{
        const key = el.getAttribute('data-filter');
        state = Object.assign({}, state, { filters: Object.assign({}, state.filters, { [key]: el.value }) });
        await loadListings();
      });
    });
    const authForm = app.querySelector('[data-form="auth"]');
    if(authForm) authForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(authForm);
      const username = (fd.get('username')||'').toString().trim();
      const password = (fd.get('password')||'').toString();
      if(state.authMode==='signup') await doSignup(username, password, state.authRole, (fd.get('phone')||'').toString(), (fd.get('city')||'').toString());
      else await doLogin(username, password);
    });
    const sellForm = app.querySelector('[data-form="sell"]');
    if(sellForm) sellForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(sellForm);
      await createListing({ title: fd.get('title'), city: fd.get('city'), price: fd.get('price'), bedrooms: fd.get('bedrooms'), bathrooms: fd.get('bathrooms'), area: fd.get('area'), description: fd.get('description') });
    });
    const msgForm = app.querySelector('[data-form="send-message"]');
    if(msgForm) msgForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(msgForm);
      await sendMessage((fd.get('text')||'').toString());
    });
  }

  async function init(){
    await tryRestoreSession();
    await loadListings();
    render();
  }
  init();
})();
