(function(){
  const API = '';
  // Single point of contact for all buyer inquiries. Update these if anything changes.
  const OWNER_PHONE = '251715737393';          // used for the WhatsApp link (no + or leading 0) — primary
  const OWNER_PHONE_DISPLAY = '+251 71 573 7393';
  const OWNER_PHONE_2 = '251939804748';         // secondary / backup call number (digits only, for tel: link)
  const OWNER_PHONE_2_DISPLAY = '+251 93 980 4748';
  const OWNER_EMAILS = ['houseinhawassa@gmail.com', 'houseinethiopia7@gmail.com'];
  const OWNER_TELEGRAMS = ['houseinhawassa', 'houseinethiopia'];
  const OWNER_TIKTOK = '@houseinhawassa';
  // Our own social pages — shown on every listing so buyers can see more
  // photos/video of houses. Never the seller's — replace these with your
  // real channel/page URLs before publishing.
  const OWNER_YOUTUBE = 'https://www.youtube.com/@houseinhawassa';
  const OWNER_FACEBOOK = 'https://www.facebook.com/houseinhawassa';
  // Words/patterns a seller might use to slip in their own contact info — we strip these
  // out of listing text so every inquiry keeps going through the numbers above.
  const CONTACT_PATTERN = /(\+?\d[\d\s\-()]{6,}\d)|(@[a-zA-Z0-9_]{3,})|(\bt\.me\/\S+)|(\btelegram\b)|(\bwhatsapp\b)|(\btiktok\b)|(\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/gi;
  function stripContactInfo(text){
    return String(text||'').replace(CONTACT_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
  }
  let state = {
    view:'home', mode:'buy', listings:[], cities:[],
    selectedId:null, detailPhotoIndex:0,
    filters:{ city:'', minPrice:'', maxPrice:'', bedrooms:'' },
    sellError:'',
    toast:'', loading:true,
    // Admin is invisible to ordinary visitors — there's no nav link into it.
    // The only way in is the #admin URL, and everything else stays hidden
    // until adminToken is set.
    adminToken: localStorage.getItem('hih_admin_token') || '',
    adminEmail: '',
    adminMode: 'login', // 'login' | 'register', toggled inside the admin form
    adminError: '',
  };

  function setState(patch){ state = Object.assign({}, state, patch); render(); }

  async function api(path, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    const res = await fetch(API+path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  async function apiAuth(path, opts={}){
    const headers = Object.assign({}, opts.headers||{}, { 'Authorization': 'Bearer '+state.adminToken });
    return api(path, Object.assign({}, opts, { headers }));
  }

  async function checkAdminSession(){
    if(!state.adminToken) return;
    try{
      const d = await apiAuth('/api/admin/me');
      setState({ adminEmail: d.email });
    }catch(e){
      // Stale/invalid token — drop it quietly.
      localStorage.removeItem('hih_admin_token');
      setState({ adminToken:'', adminEmail:'' });
    }
  }

  async function setListingStatus(id, status){
    try{
      await apiAuth('/api/listings/'+id+'/status', { method:'PATCH', body: JSON.stringify({ status }) });
      await loadListings();
      showToast(status ? 'Marked as '+status+'.' : 'Status cleared.');
    }catch(e){ showToast(e.message); }
  }

  function getEditTokens(){
    try{ return JSON.parse(localStorage.getItem('hih_edit_tokens') || '{}'); }catch(e){ return {}; }
  }
  function saveEditToken(id, token){
    const map = getEditTokens();
    map[id] = token;
    localStorage.setItem('hih_edit_tokens', JSON.stringify(map));
  }
  function getEditTokenFor(id){ return getEditTokens()[String(id)] || ''; }

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
  const MAX_PHOTOS = 10;
  // Resize to a max dimension and re-encode as JPEG so a phone photo (often 3-5MB) shrinks
  // to a couple hundred KB. That keeps 10 photos comfortably under the server's upload cap.
  function compressImage(file, maxDim, quality){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>{
        const img = new Image();
        img.onload = ()=>{
          let { width, height } = img;
          if(width > maxDim || height > maxDim){
            if(width > height){ height = Math.round(height * (maxDim/width)); width = maxDim; }
            else { width = Math.round(width * (maxDim/height)); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function filesToBase64(files){
    const list = Array.from(files).slice(0, MAX_PHOTOS);
    const out = [];
    for(const f of list){ out.push(await compressImage(f, 1600, 0.8)); }
    return out;
  }
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

  async function createListing(payload){
    try{
      const d = await api('/api/listings', { method:'POST', body: JSON.stringify(payload) });
      if(d.listing && d.listing.edit_token) saveEditToken(d.listing.id, d.listing.edit_token);
      await loadListings();
      setState({ view:'home', sellError:'' });
      showToast('Your listing is live. This browser can now edit it later from the listing page.');
    }catch(e){ setState({ sellError: e.message }); }
  }

  async function editListing(id, payload){
    try{
      const token = getEditTokenFor(id);
      const opts = { method:'PATCH', body: JSON.stringify(Object.assign({}, payload, token ? { edit_token: token } : {})) };
      if(state.adminEmail){
        await apiAuth('/api/listings/'+id, opts);
      } else {
        await api('/api/listings/'+id, opts);
      }
      await loadListings();
      setState({ view:'detail', selectedId:String(id), editError:'' });
      showToast('Listing updated.');
    }catch(e){ setState({ editError: e.message }); }
  }

  // ---------- render (same visual structure as the demo) ----------
  function renderNav(){
    // The admin controls only ever appear once an admin is actually logged in —
    // there is no visible link into /#admin for ordinary visitors.
    const adminBit = state.adminEmail
      ? `<span class="pill mono">${escapeHtml(state.adminEmail)}</span><button class="btn btn-ghost btn-sm" data-action="admin-logout">Log out</button>`
      : '';
    return `
    <div class="navbar"><div class="wrap navrow">
      <div class="brand" data-action="go-home"><span class="en display">House</span><span class="am">የቤት · house marketplace</span></div>
      <div class="navlinks">
        ${adminBit}
        <button class="btn btn-ghost btn-sm" data-action="go-sell">+ List a house</button>
      </div>
    </div>${tibeb()}</div>`;
  }

  function statusBadge(status, extraStyle){
    if(status==='sold') return `<span class="status-badge status-sold" style="${extraStyle||''}">Sold</span>`;
    if(status==='urgent') return `<span class="status-badge status-urgent" style="${extraStyle||''}">Urgent</span>`;
    return '';
  }

  // Our own social links — same set on every listing, never the seller's.
  // Lets a buyer tap straight through to watch more house videos / browse our pages.
  function renderSocialLinks(){
    return `<div class="social-row">
      <a class="social-btn yt" target="_blank" rel="noopener" href="${OWNER_YOUTUBE}">▶ YouTube</a>
      <a class="social-btn fb" target="_blank" rel="noopener" href="${OWNER_FACEBOOK}">f Facebook</a>
      <a class="social-btn tg" target="_blank" rel="noopener" href="https://t.me/${OWNER_TELEGRAMS[0]}">Telegram</a>
      <a class="social-btn tt" target="_blank" rel="noopener" href="https://www.tiktok.com/@${OWNER_TIKTOK.replace('@','')}">TikTok</a>
    </div>`;
  }

  function adminStatusControls(l){
    const canEdit = !!state.adminEmail || !!getEditTokenFor(l.id);
    const editBtn = canEdit ? `<button class="btn btn-sm btn-ghost" data-action="go-edit" data-id="${l.id}">Edit details</button>` : '';
    if(!state.adminEmail) return editBtn ? `<div style="margin-bottom:16px;">${editBtn}</div>` : '';
    return `<div class="admin-controls">
      <div class="admin-controls-label">Admin</div>
      <div class="admin-controls-row">
        ${editBtn}
        <button class="btn btn-sm ${l.status==='sold'?'btn-gold':'btn-ghost'}" data-action="mark-sold" data-id="${l.id}">Mark Sold</button>
        <button class="btn btn-sm ${l.status==='urgent'?'btn-gold':'btn-ghost'}" data-action="mark-urgent" data-id="${l.id}">Mark Urgent</button>
        ${l.status ? `<button class="btn btn-sm btn-ghost" data-action="mark-clear" data-id="${l.id}">Clear</button>` : ''}
      </div>
    </div>`;
  }

  function renderAdminAuth(){
    const isLogin = state.adminMode === 'login';
    return `<div class="wrap section">
      <a class="back" data-action="go-home">&larr; Back to listings</a>
      <div class="authbox">
        <h2>${isLogin?'Admin login':'Admin registration'}</h2>
        <p class="sub">${isLogin ? 'Sign in with an authorized owner email to manage listings.' : 'Registration only works with an authorized owner email.'}</p>
        <div class="role-toggle">
          <label class="role-opt ${isLogin?'active':''}" data-adminmode="login">Log in</label>
          <label class="role-opt ${!isLogin?'active':''}" data-adminmode="register">Register</label>
        </div>
        <form data-form="admin-auth">
          <div class="formrow"><label>Email</label><input name="email" type="email" required autocomplete="username"></div>
          <div class="formrow"><label>Password</label><input name="password" type="password" required autocomplete="${isLogin?'current-password':'new-password'}"></div>
          <button class="btn btn-gold btn-block" type="submit">${isLogin?'Log in':'Create admin account'}</button>
          ${state.adminError? `<div class="error">${escapeHtml(state.adminError)}</div>`:''}
        </form>
      </div>
    </div>`;
  }

  function renderSkyline(){
    return `<svg class="skyline" viewBox="0 0 400 70" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="30" width="18" height="40" fill="#22344F"/><rect x="22" y="15" width="14" height="55" fill="#22344F"/>
      <polygon points="45,70 55,45 65,70" fill="#22344F"/><rect x="80" y="25" width="16" height="45" fill="#22344F"/>
      <rect x="100" y="5" width="20" height="65" fill="#22344F"/><polygon points="130,70 140,42 150,70" fill="#22344F"/>
      <rect x="170" y="20" width="18" height="50" fill="#22344F"/><polygon points="200,70 212,40 224,70" fill="#22344F"/>
      <rect x="240" y="10" width="22" height="60" fill="#22344F"/><rect x="270" y="30" width="16" height="40" fill="#22344F"/>
      <polygon points="310,70 320,45 330,70" fill="#22344F"/><rect x="350" y="18" width="18" height="52" fill="#22344F"/>
      <rect x="375" y="35" width="14" height="35" fill="#22344F"/></svg>`;
  }

  function renderModeToggle(){
    return `
    <div class="mode-toggle">
      <button class="mode-btn ${state.mode==='buy'?'active':''}" data-action="go-buy">Buy</button>
      <button class="mode-btn ${state.mode==='rent'?'active':''}" data-action="go-rent">Rent</button>
      <button class="mode-btn ${state.mode==='sell'?'active':''}" data-action="go-sell">Sell</button>
    </div>`;
  }

  function visibleListings(){
    if(state.mode==='rent') return state.listings.filter(l => l.type==='rent');
    return state.listings.filter(l => l.type!=='rent');
  }

  function renderHome(){
    const f = state.filters;
    const cities = state.cities.length ? state.cities : [];
    const listings = visibleListings();
    return `
    <div class="hero"><div class="wrap" style="position:relative;z-index:1;">
      <div class="hero-eyebrow">Ethiopia, house by house</div>
      <h1>Find a bet you can actually see yourself in.</h1>
      <p>Browse homes for sale and for rent across Ethiopia. Contact us about any house — no agent, one number to call.</p>
      ${renderModeToggle()}
      <div class="searchbar">
        <div class="field"><label>City</label><select data-filter="city"><option value="">All cities</option>${cities.map(c=>`<option value="${c}" ${f.city===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Min price (ETB)</label><input type="number" data-filter="minPrice" value="${f.minPrice}"></div>
        <div class="field"><label>Max price (ETB)</label><input type="number" data-filter="maxPrice" value="${f.maxPrice}"></div>
        <div class="field"><label>Bedrooms</label><select data-filter="bedrooms"><option value="">Any</option>${[1,2,3,4].map(n=>`<option value="${n}" ${f.bedrooms==String(n)?'selected':''}>${n}+</option>`).join('')}</select></div>
        <div class="field" style="align-self:end;"><button class="btn btn-gold btn-block" data-action="clear-filters">Clear</button></div>
      </div>
    </div></div>
    <div class="wrap section">
      <div class="section-head"><h2>${state.mode==='rent'?'For rent':'For sale'}</h2><span class="count">${listings.length} house${listings.length===1?'':'s'}</span></div>
      ${listings.length ? `<div class="grid">${listings.map(renderCard).join('')}</div>` :
        `<div class="empty"><h3>No houses match those filters</h3><p>Try widening the price range, choosing a different city, or check back soon.</p></div>`}
    </div>`;
  }

  function renderCard(l){
    const cover = l.photos && l.photos[0];
    return `<div class="card" data-action="open-listing" data-id="${l.id}" style="position:relative;">
      ${statusBadge(l.status, 'position:absolute;top:10px;right:10px;z-index:2;')}
      <div class="card-img">${cover ? `<img src="${cover}" alt="">` : (l.icon||'🏠')}</div>
      <div class="card-body">
        <div class="card-city">${l.city}${l.type==='rent'?' · For rent':''}</div>
        <div class="card-title">${escapeHtml(l.title)}</div>
        <div class="card-price mono">${fmtPrice(l.price)}${l.type==='rent'?' / mo':''}</div>
        <div class="card-stats"><span>${l.bedrooms} bd</span><span>·</span><span>${l.bathrooms} ba</span><span>·</span><span>${l.area} m²</span></div>
      </div></div>`;
  }

  async function renderDetail(){
    let l = state.listings.find(x=>String(x.id)===String(state.selectedId));
    if(!l){ try{ const d = await api('/api/listings/'+state.selectedId); l = d.listing; }catch(e){} }
    if(!l) return `<div class="wrap section"><div class="empty"><h3>Listing not found</h3></div></div>`;
    const photos = l.photos || [];
    const activeIdx = Math.min(state.detailPhotoIndex||0, Math.max(photos.length-1, 0));
    return `<div class="wrap section">
      <a class="back" data-action="go-home">&larr; Back to listings</a>
      <div class="detail-grid">
        <div>
          <div class="detail-img">${photos.length ? `<img src="${photos[activeIdx]}" alt="">` : (l.icon||'🏠')}</div>
          ${photos.length > 1 ? `<div class="detail-thumbs">${photos.map((p,i)=>`<img class="detail-thumb ${i===activeIdx?'active':''}" data-action="select-photo" data-index="${i}" src="${p}" alt="">`).join('')}</div>` : ''}
          <div class="card-city">${l.city} ${statusBadge(l.status)}</div>
          <h1 style="font-size:28px;color:var(--paper);margin-top:4px;">${escapeHtml(l.title)}</h1>
          <div class="detail-stats">
            <div class="stat"><b>${l.bedrooms}</b><span>Bedrooms</span></div>
            <div class="stat"><b>${l.bathrooms}</b><span>Bathrooms</span></div>
            <div class="stat"><b>${l.area} m²</b><span>Area</span></div>
          </div>
          <div class="desc">${escapeHtml(l.description || 'No description provided yet.')}</div>
        </div>
        <div class="side-card">
          ${adminStatusControls(l)}
          <div class="side-price mono">${fmtPrice(l.price)}${l.type==='rent'?' / mo':''}</div>
          <div style="color:var(--muted);font-size:13px;">Listed ${timeAgo(l.created_at)}</div>
          <a class="btn btn-gold btn-block" style="margin-top:16px;" target="_blank" rel="noopener"
              href="https://wa.me/${OWNER_PHONE}?text=${encodeURIComponent('Hi, I\'m interested in: '+l.title+' ('+fmtPrice(l.price)+')')}">
            Contact us about this house
          </a>
          <div class="social-label">See more houses &amp; video</div>
          ${renderSocialLinks()}
          <div class="contact-note">All inquiries go through us — tap any option to open it directly<br>
            <a class="mono" style="color:var(--ink);" href="tel:+${OWNER_PHONE}">${OWNER_PHONE_DISPLAY}</a><br>
            <a class="mono" style="color:var(--ink);" href="tel:+${OWNER_PHONE_2}">${OWNER_PHONE_2_DISPLAY}</a><br>
            ${OWNER_EMAILS.map(e=>`<a class="mono" style="color:var(--ink);" href="mailto:${e}">${e}</a>`).join('<br>')}<br>
            ${OWNER_TELEGRAMS.map(t=>`<a class="mono" style="color:var(--ink);" target="_blank" rel="noopener" href="https://t.me/${t}">Telegram @${t}</a>`).join('<br>')}<br>
            <a class="mono" style="color:var(--ink);" target="_blank" rel="noopener" href="https://www.tiktok.com/@${OWNER_TIKTOK.replace('@','')}">TikTok ${OWNER_TIKTOK}</a>
          </div>
        </div>
      </div></div>`;
  }

  function renderSell(){
    const cities = state.cities.length ? state.cities : ["Addis Ababa","Hawassa","Bahir Dar","Mekelle","Adama","Dire Dawa","Gondar","Jimma"];
    return `<div class="wrap section">
      <a class="back" data-action="go-home">&larr; Back to listings</a>
      <h2 style="color:var(--paper);margin-bottom:4px;">List your house</h2>
      <p style="color:var(--muted);margin-bottom:22px;">Add a photo, price, location and description. Please don't include your phone number, email, Telegram, WhatsApp or TikTok in the text — buyers contact us directly through our numbers, and we'll reach out to you. Any contact details typed into the fields below will be removed automatically.</p>
      <form class="sell-form" data-form="sell">
        <div class="formrow">
          <label>Listing type</label>
          <div class="role-toggle">
            <label class="role-opt active" data-typeopt="sale">For sale</label>
            <label class="role-opt" data-typeopt="rent">For rent</label>
          </div>
          <input type="hidden" name="type" id="sellTypeInput" value="sale">
        </div>
        <div class="formrow"><label>Title</label><input name="title" placeholder="e.g. 2BR home near Piassa" required></div>
        <div class="formrow">
          <label>House photos (up to 10)</label>
          <div class="photo-drop"><input type="file" name="photo" accept="image/*" id="sellPhotoInput" multiple></div>
          <div class="photo-preview-grid" id="sellPhotoPreviewGrid"></div>
        </div>
        <div class="form-2col">
          <div class="formrow"><label>City</label><select name="city" required><option value="">Select city</option>${cities.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
          <div class="formrow"><label id="sellPriceLabel">Price (ETB)</label><input name="price" type="number" min="0" required></div>
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

  function renderEdit(){
    const l = state.listings.find(x=>String(x.id)===String(state.selectedId));
    const cities = state.cities.length ? state.cities : ["Addis Ababa","Hawassa","Bahir Dar","Mekelle","Adama","Dire Dawa","Gondar","Jimma"];
    if(!l) return `<div class="wrap section"><div class="empty"><h3>Listing not found</h3></div></div>`;
    return `<div class="wrap section">
      <a class="back" data-action="go-detail" data-id="${l.id}">&larr; Back to listing</a>
      <h2 style="color:var(--paper);margin-bottom:4px;">Edit listing</h2>
      <p style="color:var(--muted);margin-bottom:22px;">Fix the price, spelling, or details below. Existing photos are kept; anything you add here is appended.</p>
      <form class="sell-form" data-form="edit">
        <div class="formrow"><label>Title</label><input name="title" value="${escapeHtml(l.title)}" required></div>
        <div class="formrow">
          <label>Add more photos (optional, up to 10 total)</label>
          <div class="photo-drop"><input type="file" name="photo" accept="image/*" id="editPhotoInput" multiple></div>
          <div class="photo-preview-grid" id="editPhotoPreviewGrid"></div>
        </div>
        <div class="form-2col">
          <div class="formrow"><label>City</label><select name="city" required>${cities.map(c=>`<option value="${c}" ${l.city===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="formrow"><label>Price (ETB)</label><input name="price" type="number" min="0" value="${l.price}" required></div>
        </div>
        <div class="form-2col">
          <div class="formrow"><label>Bedrooms</label><input name="bedrooms" type="number" min="0" value="${l.bedrooms}"></div>
          <div class="formrow"><label>Bathrooms</label><input name="bathrooms" type="number" min="0" value="${l.bathrooms}"></div>
        </div>
        <div class="formrow"><label>Area (m²)</label><input name="area" type="number" min="0" value="${l.area}"></div>
        <div class="formrow"><label>Description</label><textarea name="description">${escapeHtml(l.description||'')}</textarea></div>
        <button class="btn btn-gold btn-block" type="submit">Save changes</button>
        ${state.editError? `<div class="error">${escapeHtml(state.editError)}</div>`:''}
      </form></div>`;
  }

  function renderFooter(){
    return `<div class="footer">${tibeb()}<div class="wrap" style="margin-top:16px;">
      <div>House — real listings, real database. Built for Ethiopia.</div>
      <div class="mono" style="margin-top:10px;font-size:12px;color:var(--muted);">
        <a style="color:inherit;" href="tel:+${OWNER_PHONE}">${OWNER_PHONE_DISPLAY}</a> ·
        <a style="color:inherit;" href="tel:+${OWNER_PHONE_2}">${OWNER_PHONE_2_DISPLAY}</a> ·
        ${OWNER_EMAILS.map(e=>`<a style="color:inherit;" href="mailto:${e}">${e}</a>`).join(' · ')} ·
        ${OWNER_TELEGRAMS.map(t=>`<a style="color:inherit;" target="_blank" rel="noopener" href="https://t.me/${t}">Telegram @${t}</a>`).join(' · ')} ·
        <a style="color:inherit;" target="_blank" rel="noopener" href="https://www.tiktok.com/@${OWNER_TIKTOK.replace('@','')}">TikTok ${OWNER_TIKTOK}</a>
      </div>
    </div></div>`;
  }

  async function render(){
    const app = document.getElementById('app');
    if(state.loading){ app.innerHTML = renderNav() + `<div class="loadstate">Loading listings…</div>`; return; }
    let body = '';
    if(state.view==='home') body = renderHome();
    else if(state.view==='detail') body = await renderDetail();
    else if(state.view==='sell') body = renderSell();
    else if(state.view==='edit') body = renderEdit();
    else if(state.view==='admin-auth') body = renderAdminAuth();
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
        else if(action==='go-buy') setState({ view:'home', mode:'buy' });
        else if(action==='go-rent') setState({ view:'home', mode:'rent' });
        else if(action==='go-sell') setState({ view:'sell', sellError:'' });
        else if(action==='open-listing') setState({ view:'detail', selectedId: el.getAttribute('data-id'), detailPhotoIndex: 0 });
        else if(action==='go-edit') setState({ view:'edit', selectedId: el.getAttribute('data-id'), editError:'' });
        else if(action==='go-detail') setState({ view:'detail', selectedId: el.getAttribute('data-id') });
        else if(action==='select-photo') setState({ detailPhotoIndex: Number(el.getAttribute('data-index')) });
        else if(action==='clear-filters'){ setState({ filters:{city:'',minPrice:'',maxPrice:'',bedrooms:''} }); await loadListings(); }
        else if(action==='admin-logout'){
          localStorage.removeItem('hih_admin_token');
          setState({ adminToken:'', adminEmail:'', view:'home' });
        }
        else if(action==='mark-sold') await setListingStatus(el.getAttribute('data-id'), 'sold');
        else if(action==='mark-urgent') await setListingStatus(el.getAttribute('data-id'), 'urgent');
        else if(action==='mark-clear') await setListingStatus(el.getAttribute('data-id'), null);
      });
    });
    app.querySelectorAll('[data-adminmode]').forEach(el=>{
      el.addEventListener('click', ()=>{ setState({ adminMode: el.getAttribute('data-adminmode'), adminError:'' }); });
    });
    const adminForm = app.querySelector('[data-form="admin-auth"]');
    if(adminForm) adminForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(adminForm);
      const email = (fd.get('email')||'').toString();
      const password = (fd.get('password')||'').toString();
      const path = state.adminMode==='login' ? '/api/admin/login' : '/api/admin/register';
      try{
        const d = await api(path, { method:'POST', body: JSON.stringify({ email, password }) });
        localStorage.setItem('hih_admin_token', d.token);
        setState({ adminToken: d.token, adminError:'', view:'home' });
        await checkAdminSession();
        showToast('Signed in as admin.');
      }catch(e2){ setState({ adminError: e2.message }); }
    });
    app.querySelectorAll('[data-filter]').forEach(el=>{
      el.addEventListener('change', async ()=>{
        const key = el.getAttribute('data-filter');
        state = Object.assign({}, state, { filters: Object.assign({}, state.filters, { [key]: el.value }) });
        await loadListings();
      });
    });
    const sellForm = app.querySelector('[data-form="sell"]');
    const sellTypeInput = app.querySelector('#sellTypeInput');
    const sellPriceLabel = app.querySelector('#sellPriceLabel');
    app.querySelectorAll('[data-typeopt]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const val = el.getAttribute('data-typeopt');
        app.querySelectorAll('[data-typeopt]').forEach(o=>o.classList.toggle('active', o===el));
        if(sellTypeInput) sellTypeInput.value = val;
        if(sellPriceLabel) sellPriceLabel.textContent = val==='rent' ? 'Price per month (ETB)' : 'Price (ETB)';
      });
    });
    const sellPhotoInput = app.querySelector('#sellPhotoInput');
    if(sellPhotoInput) sellPhotoInput.addEventListener('change', ()=>{
      const grid = app.querySelector('#sellPhotoPreviewGrid');
      if(!grid) return;
      const files = Array.from(sellPhotoInput.files || []).slice(0, MAX_PHOTOS);
      grid.innerHTML = files.map(f => `<img class="photo-preview-thumb" src="${URL.createObjectURL(f)}" alt="">`).join('');
      if(sellPhotoInput.files && sellPhotoInput.files.length > MAX_PHOTOS){
        showToast('Only the first 10 photos will be used.');
      }
    });
    if(sellForm) sellForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(sellForm);
      const files = sellPhotoInput && sellPhotoInput.files;
      let photos = [];
      if(files && files.length){
        showToast('Publishing…');
        photos = await filesToBase64(files);
      }
      const rawTitle = (fd.get('title')||'').toString();
      const rawDesc = (fd.get('description')||'').toString();
      const cleanTitle = stripContactInfo(rawTitle);
      const cleanDesc = stripContactInfo(rawDesc);
      const scrubbed = cleanTitle !== rawTitle.trim() || cleanDesc !== rawDesc.trim();
      await createListing({ title: cleanTitle, type: fd.get('type') || 'sale', photos, city: fd.get('city'), price: fd.get('price'), bedrooms: fd.get('bedrooms'), bathrooms: fd.get('bathrooms'), area: fd.get('area'), description: cleanDesc });
      if(scrubbed) showToast('Listing published — we removed any phone numbers or social handles from the text.');
    });
    const editPhotoInput = app.querySelector('#editPhotoInput');
    if(editPhotoInput) editPhotoInput.addEventListener('change', ()=>{
      const grid = app.querySelector('#editPhotoPreviewGrid');
      if(!grid) return;
      const files = Array.from(editPhotoInput.files || []).slice(0, MAX_PHOTOS);
      grid.innerHTML = files.map(f => `<img class="photo-preview-thumb" src="${URL.createObjectURL(f)}" alt="">`).join('');
    });
    const editForm = app.querySelector('[data-form="edit"]');
    if(editForm) editForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(editForm);
      const id = state.selectedId;
      const existing = state.listings.find(x=>String(x.id)===String(id));
      const existingPhotos = (existing && existing.photos) || [];
      const files = editPhotoInput && editPhotoInput.files;
      let newPhotos = [];
      if(files && files.length){
        showToast('Saving…');
        newPhotos = await filesToBase64(files);
      }
      const rawTitle = (fd.get('title')||'').toString();
      const rawDesc = (fd.get('description')||'').toString();
      const cleanTitle = stripContactInfo(rawTitle);
      const cleanDesc = stripContactInfo(rawDesc);
      await editListing(id, {
        title: cleanTitle, city: fd.get('city'), price: fd.get('price'),
        bedrooms: fd.get('bedrooms'), bathrooms: fd.get('bathrooms'), area: fd.get('area'),
        description: cleanDesc, photos: [...existingPhotos, ...newPhotos]
      });
    });
  }

  async function init(){
    await loadListings();
    if(state.adminToken) await checkAdminSession();
    // The only door into the admin area: visiting /#admin directly. Nothing
    // in the regular UI links here, so ordinary buyers never see it.
    if(location.hash === '#admin'){
      history.replaceState(null, '', location.pathname);
      setState({ view: state.adminEmail ? 'home' : 'admin-auth' });
    } else {
      render();
    }
  }
  init();
})();
