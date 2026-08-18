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
  // Words/patterns a seller might use to slip in their own contact info — we strip these
  // out of listing text so every inquiry keeps going through the numbers above.
  const CONTACT_PATTERN = /(\+?\d[\d\s\-()]{6,}\d)|(@[a-zA-Z0-9_]{3,})|(\bt\.me\/\S+)|(\btelegram\b)|(\bwhatsapp\b)|(\btiktok\b)|(\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/gi;
  function stripContactInfo(text){
    return String(text||'').replace(CONTACT_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
  }
  let state = {
    view:'home', mode:'buy', listings:[], cities:[],
    selectedId:null,
    filters:{ city:'', minPrice:'', maxPrice:'', bedrooms:'' },
    sellError:'',
    toast:'', loading:true,
  };

  function setState(patch){ state = Object.assign({}, state, patch); render(); }

  async function api(path, opts={}){
    const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
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
  function fileToBase64(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
      await api('/api/listings', { method:'POST', body: JSON.stringify(payload) });
      await loadListings();
      setState({ view:'home', sellError:'' });
      showToast('Your listing is live.');
    }catch(e){ setState({ sellError: e.message }); }
  }

  // ---------- render (same visual structure as the demo) ----------
  function renderNav(){
    return `
    <div class="navbar"><div class="wrap navrow">
      <div class="brand" data-action="go-home"><span class="en display">House in Hawassa</span><span class="am">የቤት · house marketplace</span></div>
      <div class="navlinks">
        <button class="btn btn-ghost btn-sm" data-action="go-sell">+ List a house</button>
      </div>
    </div>${tibeb()}</div>`;
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
    return `<div class="card" data-action="open-listing" data-id="${l.id}">
      <div class="card-img">${l.photo_data ? `<img src="${l.photo_data}" alt="">` : (l.icon||'🏠')}</div>
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
    return `<div class="wrap section">
      <a class="back" data-action="go-home">&larr; Back to listings</a>
      <div class="detail-grid">
        <div>
          <div class="detail-img">${l.photo_data ? `<img src="${l.photo_data}" alt="">` : (l.icon||'🏠')}</div>
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
          <div class="side-price mono">${fmtPrice(l.price)}${l.type==='rent'?' / mo':''}</div>
          <div style="color:var(--muted);font-size:13px;">Listed ${timeAgo(l.created_at)}</div>
          <a class="btn btn-gold btn-block" style="margin-top:16px;" target="_blank" rel="noopener"
              href="https://wa.me/${OWNER_PHONE}?text=${encodeURIComponent('Hi, I\'m interested in: '+l.title+' ('+fmtPrice(l.price)+')')}">
            Contact us about this house
          </a>
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
          <label>House photo</label>
          <div class="photo-drop"><input type="file" name="photo" accept="image/*" id="sellPhotoInput"></div>
          <img class="photo-preview" id="sellPhotoPreview" alt="">
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

  function renderFooter(){
    return `<div class="footer">${tibeb()}<div class="wrap" style="margin-top:16px;">
      <div>House in Hawassa — real listings, real database. Built for Ethiopia.</div>
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
        else if(action==='open-listing') setState({ view:'detail', selectedId: el.getAttribute('data-id') });
        else if(action==='clear-filters'){ setState({ filters:{city:'',minPrice:'',maxPrice:'',bedrooms:''} }); await loadListings(); }
      });
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
      const file = sellPhotoInput.files && sellPhotoInput.files[0];
      const preview = app.querySelector('#sellPhotoPreview');
      if(file && preview){ preview.src = URL.createObjectURL(file); preview.style.display = 'block'; }
    });
    if(sellForm) sellForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(sellForm);
      const file = sellPhotoInput && sellPhotoInput.files && sellPhotoInput.files[0];
      let photoData = '';
      if(file) photoData = await fileToBase64(file);
      const rawTitle = (fd.get('title')||'').toString();
      const rawDesc = (fd.get('description')||'').toString();
      const cleanTitle = stripContactInfo(rawTitle);
      const cleanDesc = stripContactInfo(rawDesc);
      const scrubbed = cleanTitle !== rawTitle.trim() || cleanDesc !== rawDesc.trim();
      await createListing({ title: cleanTitle, type: fd.get('type') || 'sale', photo_data: photoData, city: fd.get('city'), price: fd.get('price'), bedrooms: fd.get('bedrooms'), bathrooms: fd.get('bathrooms'), area: fd.get('area'), description: cleanDesc });
      if(scrubbed) showToast('Listing published — we removed any phone numbers or social handles from the text.');
    });
  }

  async function init(){
    await loadListings();
    render();
  }
  init();
})();
