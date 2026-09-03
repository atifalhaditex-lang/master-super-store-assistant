const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const makeId=()=> (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2));

const STORE_NAME="MASTER SUPER STORE";
const OWNER_NAME="SHOUKAT ALI TAHIR";
const SHARED_STORE_DOC="master-super-store";
const LOCAL_STORE_KEY="master_super_store_single_shop_v8";
let localUpdatedAt=0;
let cloudUnsubscribe=null;

const seed={
  settings:{shopName:STORE_NAME},
  products:[],
  transactions:[],
  customers:[],
  suppliers:[]
};

let db=freshDB(), reportPeriod="today", formContext=null, saveTimer=null, cloudReady=false;
let fb=null, auth=null, firestore=null;

function freshDB(){
  return {
    settings:{shopName:STORE_NAME},
    products:[],
    transactions:[],
    customers:[],
    suppliers:[]
  };
}
function normalizeDB(data){
  const x=(data && typeof data==="object") ? data : freshDB();
  x.settings={shopName:STORE_NAME};
  x.products=Array.isArray(x.products)?x.products:[];
  x.transactions=Array.isArray(x.transactions)?x.transactions:[];
  x.customers=Array.isArray(x.customers)?x.customers:[];
  x.suppliers=Array.isArray(x.suppliers)?x.suppliers:[];
  x.products.forEach(p=>{if(p.active===undefined)p.active=true});
  return x;
}
function loadLocalEnvelope(){
  try{
    const raw=localStorage.getItem(LOCAL_STORE_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(parsed?.data)return {data:normalizeDB(parsed.data),updatedAt:Number(parsed.updatedAt||0)};
    return {data:normalizeDB(parsed),updatedAt:0};
  }catch(err){
    console.warn("Local data read failed",err);
    return null;
  }
}
function saveLocalData(){
  try{
    localUpdatedAt=Date.now();
    localStorage.setItem(LOCAL_STORE_KEY,JSON.stringify({data:db,updatedAt:localUpdatedAt}));
  }catch(err){
    console.warn("Local data save failed",err);
  }
}
function setSyncStatus(state,text){
  const el=$("#syncStatus");if(!el)return;
  el.className="sync-status "+state;
  el.innerHTML=`<span></span> ${text}`;
}
function firebaseConfigReady(){
  const c=window.MSS_FIREBASE_CONFIG||{};
  return c.apiKey && !String(c.apiKey).includes("PASTE_") &&
         c.projectId && !String(c.projectId).includes("PASTE_");
}
function initFirebase(){
  if(!window.firebase){
    setSyncStatus("local","Device Saved");
    return false;
  }
  if(!firebaseConfigReady()){
    setSyncStatus("local","Device Saved");
    return false;
  }
  try{
    fb=firebase.apps.length?firebase.app():firebase.initializeApp(window.MSS_FIREBASE_CONFIG);
    auth=firebase.auth();
    firestore=firebase.firestore();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(console.error);
    return true;
  }catch(err){
    console.error(err);
    setSyncStatus("local","Device Saved");
    return false;
  }
}
function sharedStoreRef(){
  return firestore.collection("stores").doc(SHARED_STORE_DOC);
}
function queueCloudSave(){
  if(!cloudReady||!firestore)return;
  clearTimeout(saveTimer);
  setSyncStatus("syncing","Saving");
  saveTimer=setTimeout(saveCloudData,450);
}
async function saveCloudData(){
  if(!cloudReady||!firestore)return;
  try{
    await sharedStoreRef().set({
      data:db,
      ownerName:OWNER_NAME,
      shopName:STORE_NAME,
      clientUpdatedAt:localUpdatedAt||Date.now(),
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    setSyncStatus("synced","Cloud Saved");
  }catch(err){
    console.error(err);
    setSyncStatus("local","Device Saved");
  }
}

function saveDB(){saveLocalData();syncBrand();renderAll();queueCloudSave()}
function money(v){return "Rs "+Number(v||0).toLocaleString("en-PK",{maximumFractionDigits:2})}
function num(v){return Number(v||0)}
function todayISO(){
  const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function monthISO(){return todayISO().slice(0,7)}
function fmt(d){return new Date((d||todayISO())+"T12:00:00").toLocaleDateString("en-PK",{day:"2-digit",month:"short",year:"numeric"})}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function getProduct(id){return db.products.find(p=>p.id===id)}
function matchPeriod(t,p){const d=t.date||t.createdAt?.slice(0,10);return p==="today"?d===todayISO():p==="month"?d?.slice(0,7)===monthISO():true}
function productOptions(selected=""){return db.products.filter(p=>p.active!==false || p.id===selected).map(p=>`<option value="${p.id}" ${p.id===selected?"selected":""}>${esc(p.name)} — ${p.stock} ${esc(p.unit)}</option>`).join("")}

function syncBrand(){
  document.title=STORE_NAME;
  $("#headerStoreName") && ($("#headerStoreName").textContent=STORE_NAME);
}
function navigate(v){
  $$(".view").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  $$(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.nav===v));
  window.scrollTo({top:0,behavior:"smooth"});
}

async function loadSharedStore(){
  setSyncStatus("syncing","Syncing");
  const ref=sharedStoreRef();
  const snap=await ref.get();
  const local=loadLocalEnvelope();
  const remote=snap.exists?snap.data():null;
  const remoteTime=Number(remote?.clientUpdatedAt||0);
  const localTime=Number(local?.updatedAt||0);

  if(remote?.data && remoteTime>=localTime){
    db=normalizeDB(remote.data);
    localUpdatedAt=remoteTime||Date.now();
    localStorage.setItem(LOCAL_STORE_KEY,JSON.stringify({data:db,updatedAt:localUpdatedAt}));
  }else if(local?.data){
    db=normalizeDB(local.data);
    localUpdatedAt=localTime||Date.now();
    await ref.set({
      data:db,
      ownerName:OWNER_NAME,
      shopName:STORE_NAME,
      clientUpdatedAt:localUpdatedAt,
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  }else{
    db=freshDB();
    saveLocalData();
    await ref.set({
      data:db,
      ownerName:OWNER_NAME,
      shopName:STORE_NAME,
      clientUpdatedAt:localUpdatedAt,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  }

  cloudReady=true;
  syncBrand();
  renderAll();
  setSyncStatus("synced","Cloud Saved");

  if(cloudUnsubscribe)cloudUnsubscribe();
  cloudUnsubscribe=ref.onSnapshot(doc=>{
    const rd=doc.data();
    const stamp=Number(rd?.clientUpdatedAt||0);
    if(rd?.data && stamp>localUpdatedAt){
      db=normalizeDB(rd.data);
      localUpdatedAt=stamp;
      localStorage.setItem(LOCAL_STORE_KEY,JSON.stringify({data:db,updatedAt:localUpdatedAt}));
      renderAll();
      setSyncStatus("synced","Cloud Updated");
    }
  },err=>console.warn("Live cloud sync unavailable",err));
}

async function startSingleShop(){
  syncBrand();

  const local=loadLocalEnvelope();
  if(local?.data){
    db=normalizeDB(local.data);
    localUpdatedAt=local.updatedAt||0;
  }else{
    db=freshDB();
    saveLocalData();
  }
  renderAll();

  if(!initFirebase()){
    setSyncStatus("local","Device Saved");
    return;
  }

  try{
    if(!auth.currentUser)await auth.signInAnonymously();
    await loadSharedStore();

    document.addEventListener("visibilitychange",async()=>{
      if(document.visibilityState==="visible" && cloudReady){
        try{await loadSharedStore()}
        catch(err){
          console.error(err);
          setSyncStatus("local","Device Saved");
        }
      }
    },{passive:true});
  }catch(err){
    console.error(err);
    setSyncStatus("local","Device Saved");
  }
}

function activityRow(t){
  const names={sale:"Sale",purchase:"Purchase",home:"Home Use",loss:"Loss",expense:"Expense",adjustment:"Stock Adjustment",customer_payment:"Customer Payment",supplier_payment:"Supplier Payment"};
  const p=getProduct(t.productId);
  const party=t.customerId?db.customers.find(c=>c.id===t.customerId)?.name:t.supplierId?db.suppliers.find(s=>s.id===t.supplierId)?.name:"";
  return `<div class="row-item activity-row"><div class="row-main"><strong>${names[t.type]||"Activity"}${p?" · "+esc(p.name):""}</strong><small>${fmt(t.date)}${party?" · "+esc(party):""}${t.note?" · "+esc(t.note):""}</small></div><div class="row-end"><span class="${["sale","customer_payment"].includes(t.type)?"amount-positive":"amount-negative"}">${money(t.total??t.value??0)}</span><button class="mini-delete" data-delete-transaction="${t.id}" type="button" aria-label="Delete transaction" title="Delete entry">×</button></div></div>`
}
function renderDashboard(){
  const tx=db.transactions.filter(t=>matchPeriod(t,"today"));
  $("#todaySales").textContent=money(tx.filter(t=>t.type==="sale").reduce((a,t)=>a+num(t.total),0));
  $("#todayProfit").textContent=money(tx.filter(t=>t.type==="sale").reduce((a,t)=>a+num(t.profit),0));
  $("#stockValue").textContent=money(db.products.reduce((a,p)=>a+num(p.stock)*num(p.avgCost),0));
  $("#customerReceivable").textContent=money(db.customers.reduce((a,c)=>a+num(c.balance),0));
  $("#supplierPayable").textContent=money(db.suppliers.reduce((a,s)=>a+num(s.balance),0));
  const low=db.products.filter(p=>p.active!==false && num(p.stock)<=num(p.minStock));
  $("#lowStockCount").textContent=`${low.length} items`;
  $("#lowStockList").innerHTML=low.length?low.slice(0,6).map(p=>`<div class="row-item"><div class="row-main"><strong>${esc(p.name)}</strong><small>${p.stock} ${esc(p.unit)} remaining</small></div><span class="badge warn">Min ${p.minStock}</span></div>`).join(""):`<div class="success-state"><span>✓</span><div><strong>Stock levels look healthy</strong><small>No product is below its minimum level.</small></div></div>`;
  const recent=[...db.transactions].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);
  $("#recentActivity").innerHTML=recent.length?recent.map(activityRow).join(""):`<div class="empty-state"><div class="empty-icon">↗</div><strong>No activity yet</strong><span>Your latest sales and purchases will appear here.</span></div>`
}
function renderInventory(){
  const q=($("#inventorySearch")?.value||"").toLowerCase();
  const status=$("#inventoryStatusFilter")?.value||"active";
  const list=db.products.filter(p=>{
    const statusOk=status==="all" || (status==="active" ? p.active!==false : p.active===false);
    const searchOk=!q||[p.name,p.category,p.unit].some(x=>String(x).toLowerCase().includes(q));
    return statusOk && searchOk;
  });
  $("#inventoryList").innerHTML=list.length?list.map(p=>`<article class="product-card ${p.active===false?"inactive-product":""}">
    <div class="product-top">
      <div class="product-info"><div class="product-avatar">${esc((p.name||"?").slice(0,2).toUpperCase())}</div><div><div class="product-name">${esc(p.name)}</div><div class="product-meta">${esc(p.category)} · ${esc(p.unit)} ${p.active===false?"· Inactive":""}</div></div></div>
      <span class="stock-pill ${num(p.stock)<=num(p.minStock)?"low":""}">${p.stock} ${esc(p.unit)}</span>
    </div>
    <div class="product-metrics">
      <div><span>Purchase Cost</span><b>${money(p.avgCost)}</b></div>
      <div><span>Sale</span><b>${money(p.salePrice)}</b></div>
      <div><span>Margin</span><b>${p.salePrice?(((num(p.salePrice)-num(p.avgCost))/num(p.salePrice))*100).toFixed(1):"0.0"}%</b></div>
      <div><span>Stock Value</span><b>${money(num(p.stock)*num(p.avgCost))}</b></div>
    </div>
    <div class="small-actions">
      <button class="small-btn" data-edit-product="${p.id}" type="button">Edit</button>
      <button class="small-btn" data-adjust-product="${p.id}" type="button">Adjust</button>
      <button class="small-btn ${p.active===false?"activate-btn":""}" data-toggle-product="${p.id}" type="button">${p.active===false?"Activate":"Deactivate"}</button>
      <button class="small-btn danger-action" data-delete-product="${p.id}" type="button">Delete</button>
    </div>
  </article>`).join(""):`<div class="empty-state"><div class="empty-icon">▦</div><strong>No products found</strong><span>Try changing the search or product status.</span></div>`
}
function renderTransactions(){
  const f=$("#transactionFilter").value;
  const list=[...db.transactions].filter(t=>f==="all"||t.type===f).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const names={sale:"Sale",purchase:"Purchase",home:"Home Use",loss:"Loss",expense:"Expense",adjustment:"Stock Adjustment",customer_payment:"Customer Payment",supplier_payment:"Supplier Payment"};
  $("#transactionList").innerHTML=list.length?list.map(t=>{
    const p=getProduct(t.productId);
    const c=t.customerId?db.customers.find(x=>x.id===t.customerId):null;
    const s=t.supplierId?db.suppliers.find(x=>x.id===t.supplierId):null;
    return `<article class="activity-card">
      <div class="activity-top"><div><strong>${names[t.type]||t.type}</strong><div class="activity-meta">${fmt(t.date)}${p?" · "+esc(p.name):""}${c?" · "+esc(c.name):""}${s?" · "+esc(s.name):""}</div></div><span class="badge">${money(t.total??t.value??0)}</span></div>
      ${t.quantity?`<div class="product-bottom"><span>Qty <b>${t.quantity}</b></span>${t.rate?`<span>Rate <b>${money(t.rate)}</b></span>`:""}${t.profit!==undefined?`<span>Profit <b>${money(t.profit)}</b></span>`:""}</div>`:""}
      <div class="small-actions transaction-actions">${["sale","purchase","home","loss","expense","adjustment","customer_payment","supplier_payment"].includes(t.type)?`<button class="small-btn" data-edit-transaction="${t.id}" type="button">Edit</button>`:""}<button class="small-btn danger-action" data-delete-transaction="${t.id}" type="button">Delete Entry</button></div>
    </article>`
  }).join(""):`<div class="empty">No transactions yet.</div>`
}
function renderPeople(){
  $("#khataTotal").textContent=money(db.customers.reduce((a,c)=>a+num(c.balance),0));$("#customerCount").textContent=db.customers.length;
  $("#customerList").innerHTML=db.customers.length?db.customers.map(c=>`<article class="person-card">
    <div class="person-top">
      <div class="person-info">
        <div class="person-avatar">${esc((c.name||"?").slice(0,2).toUpperCase())}</div>
        <div><div class="person-name">${esc(c.name)}</div><div class="person-meta">${esc(c.phone||"No phone number")}</div></div>
      </div>
      <span class="badge ${num(c.balance)>0?"warn":""}">${money(c.balance)}</span>
    </div>
    <div class="small-actions">
      <button class="small-btn" data-edit-customer="${c.id}" type="button">Edit</button>
      <button class="small-btn" data-customer-sale="${c.id}" type="button">Add Udhar</button>
      <button class="small-btn" data-customer-pay="${c.id}" type="button">Receive Payment</button>
    </div>
  </article>`).join(""):`<div class="empty">No customers added.</div>`;

  $("#supplierList").innerHTML=db.suppliers.length?db.suppliers.map(s=>`<article class="person-card">
    <div class="person-top">
      <div class="person-info">
        <div class="person-avatar">${esc((s.name||"?").slice(0,2).toUpperCase())}</div>
        <div><div class="person-name">${esc(s.name)}</div><div class="person-meta">${esc(s.phone||"No phone number")}</div></div>
      </div>
      <span class="badge ${num(s.balance)>0?"warn":""}">${money(s.balance)}</span>
    </div>
    <div class="small-actions">
      <button class="small-btn" data-edit-supplier="${s.id}" type="button">Edit</button>
      <button class="small-btn" data-supplier-pay="${s.id}" type="button">Pay Supplier</button>
    </div>
  </article>`).join(""):`<div class="empty">No suppliers added.</div>`
}
function renderReports(){
  const l=db.transactions.filter(t=>matchPeriod(t,reportPeriod)), sum=(type,key="total")=>l.filter(t=>t.type===type).reduce((a,t)=>a+num(t[key]),0);
  const sales=sum("sale"), gross=sum("sale","profit"), expenses=sum("expense"), home=sum("home"), loss=sum("loss"), purchases=sum("purchase"), stock=db.products.reduce((a,p)=>a+num(p.stock)*num(p.avgCost),0);
  $("#reportSales").textContent=money(sales);$("#reportGross").textContent=money(gross);$("#reportExpenses").textContent=money(expenses);$("#reportNet").textContent=money(gross-expenses-loss);$("#reportHome").textContent=money(home);$("#reportLoss").textContent=money(loss);$("#reportPurchases").textContent=money(purchases);$("#reportStock").textContent=money(stock);
  const sold={};l.filter(t=>t.type==="sale").forEach(t=>{sold[t.productId]=(sold[t.productId]||0)+num(t.quantity)});
  const top=Object.entries(sold).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $("#topSellingList").innerHTML=top.length?top.map(([id,q])=>`<div class="row-item"><div class="row-main"><strong>${esc(getProduct(id)?.name||db.transactions.find(t=>t.productId===id&&t.productName)?.productName||"Deleted Product")}</strong><small>${q} sold</small></div></div>`).join(""):`<div class="empty">No sales in this period.</div>`;
  const warnings=[];const low=db.products.filter(p=>p.active!==false && num(p.stock)<=num(p.minStock));if(low.length)warnings.push(`${low.length} item(s) low in stock.`);if(db.customers.some(c=>num(c.balance)>0))warnings.push("Customer udhar is pending.");if(db.suppliers.some(s=>num(s.balance)>0))warnings.push("Supplier payments are pending.");
  $("#reportWarnings").innerHTML=warnings.length?warnings.map(w=>`<div class="row-item"><div class="row-main"><strong>${esc(w)}</strong></div></div>`).join(""):`<div class="empty">No warnings.</div>`
}
function renderAll(){renderDashboard();renderInventory();renderTransactions();renderPeople();renderReports()}

function f(label,name,type="text",o={}){return `<div class="form-group${o.full?" full":""}"><label>${label}</label><input name="${name}" type="${type}" ${o.required?"required":""} ${o.min!==undefined?`min="${o.min}"`:""} ${o.step?`step="${o.step}"`:""} value="${esc(o.value??"")}"></div>`}
function sf(label,name,options,o={}){return `<div class="form-group${o.full?" full":""}"><label>${label}</label><select name="${name}" ${o.required?"required":""}>${options}</select></div>`}
function openModal(kind,ctx={}){
  formContext={kind,ctx};$("#formMessage").textContent="";const b=$("#modalBody"), t=$("#modalTitle");const d=todayISO();
  if(kind==="product"){const p=ctx.product||{};t.textContent=p.id?"Edit Product":"Add Product";b.innerHTML=`<div class="form-grid">${f("Product Name","name","text",{required:true,value:p.name||""})}${f("Category","category","text",{required:true,value:p.category||"Grocery"})}${sf("Unit","unit",["KG","Gram","Liter","ML","Piece","Packet","Box","Dozen","Carton","Bag","Bottle","Tin","Pouch"].map(u=>`<option ${p.unit===u?"selected":""}>${u}</option>`).join(""))}${p.id?`<div class="form-group"><div class="balance-info"><span>Current Stock</span><strong>${p.stock} ${esc(p.unit)}</strong><small>Use Adjust Stock to change quantity so history stays correct.</small></div></div>`:f("Opening Stock","stock","number",{required:true,min:0,step:"0.01",value:p.stock??0})}${f("Purchase Cost","avgCost","number",{required:true,min:0,step:"0.01",value:p.avgCost??0})}${f("Sale Price","salePrice","number",{required:true,min:0,step:"0.01",value:p.salePrice??0})}${f("Low Stock Alert","minStock","number",{required:true,min:0,step:"0.01",value:p.minStock??0})}</div>`}
  if(kind==="udhar_sale"){
    t.textContent="Quick Udhar Sale";
    const pf=ctx.prefill||{};
    b.innerHTML=`<div class="udhar-callout"><div class="udhar-callout-icon">U</div><div><strong>Fast Udhar Entry</strong><small>Select customer, item and quantity. Balance updates automatically.</small></div></div>
    <div class="form-grid">
      ${sf("Customer","customerId",`<option value="">Select customer</option>${db.customers.map(c=>`<option value="${c.id}" ${(ctx.customerId||pf.customerId)===c.id?"selected":""}>${esc(c.name)} — ${money(c.balance)}</option>`).join("")}`,{required:true,full:true})}
      ${sf("Product","productId",productOptions(ctx.productId||pf.productId),{required:true,full:true})}
      ${f("Date","date","date",{required:true,value:pf.date||d})}
      ${f("Quantity","quantity","number",{required:true,min:0.01,step:"0.01",value:pf.quantity||""})}
      ${f("Sale Rate","rate","number",{min:0,step:"0.01",value:pf.rate||""})}
    </div>
    ${db.customers.length?`<p class="form-hint">Tip: Customer balance is shown beside the name. This sale will be added directly to their khata.</p>`:`<p class="error-text">Add a customer first before making an udhar sale.</p>`}`;
  }
  if(["sale","purchase","home","loss","adjustment"].includes(kind)){const pf=ctx.prefill||{};t.textContent={sale:"Add Sale",purchase:"Add Purchase",home:"Home Use",loss:"Loss / Wastage",adjustment:"Adjust Stock"}[kind];b.innerHTML=`<div class="form-grid">${sf("Product","productId",productOptions(ctx.productId||pf.productId),{required:true,full:true})}${f("Date","date","date",{required:true,value:pf.date||d})}${f(kind==="adjustment"?"Actual Stock":"Quantity","quantity","number",{required:true,min:0,step:"0.01",value:pf.quantity||""})}${kind==="sale"?f("Sale Rate","rate","number",{min:0,step:"0.01",value:pf.rate||""}):""}${kind==="purchase"?f("Purchase Rate","rate","number",{min:0,step:"0.01",required:true,value:pf.rate||""}):""}${kind==="sale"?sf("Payment Type","paymentType",`<option value="cash" ${(pf.paymentType||"cash")==="cash"?"selected":""}>Cash</option><option value="udhar" ${pf.paymentType==="udhar"?"selected":""}>Udhar / Credit</option>`):""}${kind==="sale"?sf("Customer","customerId",`<option value="">Select customer</option>${db.customers.map(c=>`<option value="${c.id}" ${(ctx.customerId||pf.customerId)===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}`,{full:true}):""}${kind==="purchase"?sf("Supplier","supplierId",`<option value="">Cash / No supplier</option>${db.suppliers.map(s=>`<option value="${s.id}" ${(pf.supplierId||"")===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}`,{full:true}):""}${kind==="purchase"?sf("Purchase Type","purchaseType",`<option value="cash" ${pf.purchaseType==="cash"?"selected":""}>Cash</option><option value="credit" ${pf.purchaseType==="credit"?"selected":""}>Credit / Pay Later</option>`):""}${kind==="loss"?sf("Reason","reason",["Expired","Damaged","Broken","Leakage","Missing","Theft","Other"].map(x=>`<option ${pf.note===x?"selected":""}>${x}</option>`).join("")):""}</div>`}
  if(kind==="expense"){const pf=ctx.prefill||{};const raw=(pf.note||"").split(" · ");const cat=raw[0]||"Miscellaneous", note=raw.slice(1).join(" · ");t.textContent="Add Expense";b.innerHTML=`<div class="form-grid">${f("Date","date","date",{required:true,value:pf.date||d})}${sf("Category","category",["Electricity","Rent","Transport","Loading","Labour","Fuel","Repair","Mobile","Bags","Miscellaneous"].map(x=>`<option ${x===cat?"selected":""}>${x}</option>`).join(""))}${f("Amount","amount","number",{required:true,min:0,step:"0.01",value:pf.total||""})}${f("Note","note","text",{full:true,value:note})}</div>`}
  if(kind==="customer"){const c=ctx.customer||{};t.textContent=c.id?"Edit Customer":"Add Customer";b.innerHTML=`<div class="form-grid">${f("Customer Name","name","text",{required:true,value:c.name||""})}${f("Phone","phone","text",{value:c.phone||""})}${c.id?`<div class="form-group full"><div class="balance-info"><span>Current Balance</span><strong>${money(c.balance)}</strong><small>Balance is changed through Udhar Sale / Receive Payment, not from profile edit.</small></div></div>`:f("Opening Balance","balance","number",{min:0,step:"0.01",value:0})}</div>`}
  if(kind==="supplier"){const s=ctx.supplier||{};t.textContent=s.id?"Edit Supplier":"Add Supplier";b.innerHTML=`<div class="form-grid">${f("Supplier Name","name","text",{required:true,value:s.name||""})}${f("Phone","phone","text",{value:s.phone||""})}${s.id?`<div class="form-group full"><div class="balance-info"><span>Current Payable</span><strong>${money(s.balance)}</strong><small>Payable is changed through credit purchases / supplier payments.</small></div></div>`:f("Opening Balance","balance","number",{min:0,step:"0.01",value:0})}</div>`}
  if(kind==="customer_payment"||kind==="supplier_payment"){const pf=ctx.prefill||{};t.textContent=kind==="customer_payment"?"Receive Customer Payment":"Pay Supplier";b.innerHTML=`<div class="form-grid">${f("Date","date","date",{required:true,value:pf.date||d})}${f("Amount","amount","number",{required:true,min:0.01,step:"0.01",value:pf.total||""})}${f("Note","note","text",{full:true,value:pf.note||""})}</div>`}
  if(kind==="settings"){t.textContent="Store Settings";b.innerHTML=`<div class="form-grid"><div class="form-group full"><div class="balance-info"><span>Store</span><strong>MASTER SUPER STORE</strong></div></div><div class="form-group full"><div class="balance-info"><span>Owner</span><strong>SHOUKAT ALI TAHIR</strong><small>Single-shop shared cloud edition</small></div></div></div>`}
  $("#modal").showModal()
}


function txTime(t){return new Date(t.createdAt||`${t.date||todayISO()}T12:00:00`).getTime()}
function hasLaterRelatedTransaction(t){
  const affectingStock=["sale","purchase","home","loss","adjustment"];
  return db.transactions.some(x=>{
    if(x.id===t.id || txTime(x)<=txTime(t))return false;
    if(affectingStock.includes(t.type) && affectingStock.includes(x.type) && t.productId && x.productId===t.productId)return true;
    if((t.type==="customer_payment" || (t.type==="sale"&&t.paymentType==="udhar")) && t.customerId){
      return (x.customerId===t.customerId) && (x.type==="customer_payment" || (x.type==="sale"&&x.paymentType==="udhar"));
    }
    if((t.type==="supplier_payment" || (t.type==="purchase"&&t.purchaseType==="credit")) && t.supplierId){
      return (x.supplierId===t.supplierId) && (x.type==="supplier_payment" || (x.type==="purchase"&&x.purchaseType==="credit"));
    }
    return false;
  });
}
function assertSafeHistoricalChange(t){
  if(hasLaterRelatedTransaction(t)){
    throw Error("A later related transaction already exists. Edit/delete the newer related entry first so stock and balances stay accurate.");
  }
}
function reverseTransaction(t){
  if(!t)return;
  const p=t.productId?getProduct(t.productId):null;

  if(t.type==="sale"){
    if(p)p.stock=num(p.stock)+num(t.quantity);
    if(t.paymentType==="udhar"&&t.customerId){
      const c=db.customers.find(x=>x.id===t.customerId);
      if(c)c.balance=Math.max(0,num(c.balance)-num(t.total));
    }
  }else if(t.type==="purchase"){
    if(p){
      p.stock=Math.max(0,num(p.stock)-num(t.quantity));
      if(t.previousAvgCost!==undefined)p.avgCost=num(t.previousAvgCost);
    }
    if(t.purchaseType==="credit"&&t.supplierId){
      const s=db.suppliers.find(x=>x.id===t.supplierId);
      if(s)s.balance=Math.max(0,num(s.balance)-num(t.total));
    }
  }else if(t.type==="home"||t.type==="loss"){
    if(p)p.stock=num(p.stock)+num(t.quantity);
  }else if(t.type==="adjustment"){
    if(p && t.previousStock!==undefined)p.stock=num(t.previousStock);
  }else if(t.type==="customer_payment"){
    const c=db.customers.find(x=>x.id===t.customerId);
    if(c)c.balance=num(c.balance)+num(t.appliedAmount??t.total);
  }else if(t.type==="supplier_payment"){
    const s=db.suppliers.find(x=>x.id===t.supplierId);
    if(s)s.balance=num(s.balance)+num(t.appliedAmount??t.total);
  }
}
function deleteTransaction(id){
  const t=db.transactions.find(x=>x.id===id);if(!t)return;
  try{assertSafeHistoricalChange(t)}catch(err){alert(err.message);return}
  const labels={sale:"sale",purchase:"purchase",home:"home-use",loss:"loss",expense:"expense",adjustment:"stock adjustment",customer_payment:"customer payment",supplier_payment:"supplier payment"};
  if(!window.confirm(`Delete this ${labels[t.type]||"entry"} of ${money(t.total??t.value??0)}? Its stock/khata effect will be reversed.`))return;
  reverseTransaction(t);
  db.transactions=db.transactions.filter(x=>x.id!==id);
  saveDB();
}
function editTransaction(id){
  const old=db.transactions.find(x=>x.id===id);if(!old)return;
  const editable=["sale","purchase","home","loss","expense","adjustment","customer_payment","supplier_payment"];
  if(!editable.includes(old.type))return;
  try{assertSafeHistoricalChange(old)}catch(err){alert(err.message);return}

  const common={editTransactionId:old.id,prefill:old};
  if(old.type==="sale"){
    openModal(old.paymentType==="udhar"?"udhar_sale": "sale",{...common,productId:old.productId,customerId:old.customerId});
  }else if(old.type==="customer_payment"){
    openModal("customer_payment",{...common,id:old.customerId});
  }else if(old.type==="supplier_payment"){
    openModal("supplier_payment",{...common,id:old.supplierId});
  }else if(old.type==="adjustment"){
    openModal("adjustment",{...common,productId:old.productId,prefill:{...old,quantity:old.newStock??old.quantity}});
  }else{
    openModal(old.type,{...common,productId:old.productId});
  }
}

function saveForm(fd){
  const {kind,ctx}=formContext, now=new Date().toISOString();
  const backup=structuredClone(db);

  try{
    if(ctx?.editTransactionId){
      const old=db.transactions.find(x=>x.id===ctx.editTransactionId);
      if(!old)throw Error("Original transaction was not found.");
      assertSafeHistoricalChange(old);
      reverseTransaction(old);
      db.transactions=db.transactions.filter(x=>x.id!==old.id);
    }

    if(kind==="product"){
      const name=fd.get("name")?.trim();if(!name)throw Error("Product name is required.");
      const base={name,category:fd.get("category")?.trim()||"Grocery",unit:fd.get("unit"),avgCost:num(fd.get("avgCost")),salePrice:num(fd.get("salePrice")),minStock:num(fd.get("minStock"))};
      if(ctx.product){
        Object.assign(ctx.product,base); // Stock is intentionally not editable here.
      }else{
        db.products.push({id:makeId(),active:true,stock:num(fd.get("stock")),...base});
      }
    }

    else if(kind==="udhar_sale"){
      const p=getProduct(fd.get("productId")), c=db.customers.find(x=>x.id===fd.get("customerId"));
      if(!p)throw Error("Please select a product.");
      if(!c)throw Error("Please select a customer.");
      const q=num(fd.get("quantity"));if(q<=0)throw Error("Quantity must be greater than 0.");
      if(q>num(p.stock))throw Error(`Only ${p.stock} ${p.unit} available in stock.`);
      const rate=num(fd.get("rate"))||num(p.salePrice);if(rate<0)throw Error("Sale rate is invalid.");
      const total=q*rate,cost=q*num(p.avgCost),profit=total-cost;
      p.stock=num(p.stock)-q;c.balance=num(c.balance)+total;
      db.transactions.push({id:makeId(),type:"sale",productId:p.id,productName:p.name,unit:p.unit,quantity:q,rate,total,cost,profit,date:fd.get("date"),createdAt:now,paymentType:"udhar",customerId:c.id,customerName:c.name});
    }

    else if(["sale","purchase","home","loss","adjustment"].includes(kind)){
      const p=getProduct(fd.get("productId"));if(!p)throw Error("Please select a product.");
      const q=num(fd.get("quantity")), date=fd.get("date");

      if(kind==="adjustment"){
        if(q<0)throw Error("Actual stock cannot be negative.");
        const old=num(p.stock);p.stock=q;
        db.transactions.push({id:makeId(),type:"adjustment",productId:p.id,productName:p.name,unit:p.unit,quantity:Math.abs(q-old),value:Math.abs(q-old)*num(p.avgCost),total:Math.abs(q-old)*num(p.avgCost),date,createdAt:now,note:`Stock ${old} → ${q}`,previousStock:old,newStock:q});
      }

      if(kind==="purchase"){
        if(q<=0)throw Error("Quantity must be greater than 0.");
        const rate=num(fd.get("rate"));if(rate<0)throw Error("Purchase rate is invalid.");
        const sid=fd.get("supplierId"), purchaseType=fd.get("purchaseType")||"cash";
        if(purchaseType==="credit"&&!sid)throw Error("Select a supplier for Credit / Pay Later purchase.");
        const oldQty=num(p.stock),oldAvgCost=num(p.avgCost),oldVal=oldQty*oldAvgCost,addVal=q*rate;
        p.stock=oldQty+q;p.avgCost=(oldVal+addVal)/(p.stock||1);
        if(purchaseType==="credit"){
          const s=db.suppliers.find(x=>x.id===sid);if(!s)throw Error("Supplier not found.");
          s.balance=num(s.balance)+addVal;
        }
        db.transactions.push({id:makeId(),type:"purchase",productId:p.id,productName:p.name,unit:p.unit,quantity:q,rate,total:addVal,date,createdAt:now,supplierId:sid,purchaseType,previousStock:oldQty,previousAvgCost:oldAvgCost,supplierName:db.suppliers.find(x=>x.id===sid)?.name||""});
      }

      if(["sale","home","loss"].includes(kind)){
        if(q<=0)throw Error("Quantity must be greater than 0.");
        if(q>num(p.stock))throw Error(`Only ${p.stock} ${p.unit} available in stock.`);
        p.stock=num(p.stock)-q;const cost=q*num(p.avgCost);

        if(kind==="sale"){
          const rate=num(fd.get("rate"))||num(p.salePrice),total=q*rate,profit=total-cost,pay=fd.get("paymentType")||"cash",cid=fd.get("customerId");
          if(pay==="udhar"){
            if(!cid)throw Error("Select customer for udhar sale.");
            const c=db.customers.find(x=>x.id===cid);if(!c)throw Error("Customer not found.");
            c.balance=num(c.balance)+total;
          }
          db.transactions.push({id:makeId(),type:"sale",productId:p.id,productName:p.name,unit:p.unit,quantity:q,rate,total,cost,profit,date,createdAt:now,paymentType:pay,customerId:cid||"",customerName:db.customers.find(x=>x.id===cid)?.name||""});
        }
        if(kind==="home")db.transactions.push({id:makeId(),type:"home",productId:p.id,productName:p.name,unit:p.unit,quantity:q,total:cost,date,createdAt:now});
        if(kind==="loss")db.transactions.push({id:makeId(),type:"loss",productId:p.id,productName:p.name,unit:p.unit,quantity:q,total:cost,date,createdAt:now,note:fd.get("reason")});
      }
    }

    else if(kind==="expense"){
      const amount=num(fd.get("amount"));if(amount<=0)throw Error("Expense amount must be greater than 0.");
      db.transactions.push({id:makeId(),type:"expense",total:amount,date:fd.get("date"),createdAt:now,note:`${fd.get("category")}${fd.get("note")?" · "+fd.get("note"):""}`});
    }

    else if(kind==="customer"){
      const name=fd.get("name")?.trim();if(!name)throw Error("Customer name is required.");
      if(ctx.customer){ctx.customer.name=name;ctx.customer.phone=fd.get("phone")?.trim()||""}
      else db.customers.push({id:makeId(),name,phone:fd.get("phone")?.trim()||"",balance:num(fd.get("balance"))});
    }

    else if(kind==="supplier"){
      const name=fd.get("name")?.trim();if(!name)throw Error("Supplier name is required.");
      if(ctx.supplier){ctx.supplier.name=name;ctx.supplier.phone=fd.get("phone")?.trim()||""}
      else db.suppliers.push({id:makeId(),name,phone:fd.get("phone")?.trim()||"",balance:num(fd.get("balance"))});
    }

    else if(kind==="customer_payment"){
      const c=db.customers.find(x=>x.id===ctx.id),amount=num(fd.get("amount"));
      if(!c)throw Error("Customer not found.");
      if(amount<=0)throw Error("Payment amount must be greater than 0.");
      if(amount>num(c.balance))throw Error(`Payment cannot exceed current balance of ${money(c.balance)}.`);
      c.balance=num(c.balance)-amount;
      db.transactions.push({id:makeId(),type:"customer_payment",customerId:c.id,customerName:c.name,total:amount,appliedAmount:amount,date:fd.get("date"),createdAt:now,note:fd.get("note")?.trim()||c.name});
    }

    else if(kind==="supplier_payment"){
      const s=db.suppliers.find(x=>x.id===ctx.id),amount=num(fd.get("amount"));
      if(!s)throw Error("Supplier not found.");
      if(amount<=0)throw Error("Payment amount must be greater than 0.");
      if(amount>num(s.balance))throw Error(`Payment cannot exceed current payable of ${money(s.balance)}.`);
      s.balance=num(s.balance)-amount;
      db.transactions.push({id:makeId(),type:"supplier_payment",supplierId:s.id,supplierName:s.name,total:amount,appliedAmount:amount,date:fd.get("date"),createdAt:now,note:fd.get("note")?.trim()||s.name});
    }


    saveDB();
  }catch(err){
    db=backup;
    throw err;
  }
}

$("#dynamicForm").addEventListener("submit",e=>{e.preventDefault();try{saveForm(new FormData(e.currentTarget));$("#modal").close()}catch(err){$("#formMessage").textContent=err.message}});
$("#closeModalBtn").onclick=$("#cancelModalBtn").onclick=()=>$("#modal").close();
$("#addProductBtn").onclick=()=>openModal("product");
$("#addCustomerBtn").onclick=()=>openModal("customer");
$("#addSupplierBtn").onclick=()=>openModal("supplier");
$("#settingsBtn").onclick=()=>openModal("settings");
$("#inventorySearch").addEventListener("input",renderInventory);
$("#inventoryStatusFilter").addEventListener("change",renderInventory);
$("#transactionFilter").addEventListener("change",renderTransactions);
document.addEventListener("click",e=>{
  const nav=e.target.closest("[data-nav]");if(nav)navigate(nav.dataset.nav);
  const o=e.target.closest("[data-open-form]");if(o)openModal(o.dataset.openForm);
  const ep=e.target.closest("[data-edit-product]");if(ep)openModal("product",{product:getProduct(ep.dataset.editProduct)});
  const ap=e.target.closest("[data-adjust-product]");if(ap)openModal("adjustment",{productId:ap.dataset.adjustProduct});
  const tp=e.target.closest("[data-toggle-product]");if(tp){
    const p=getProduct(tp.dataset.toggleProduct);
    if(p){p.active=p.active===false;saveDB();}
  }
  const dp=e.target.closest("[data-delete-product]");if(dp){
    const p=getProduct(dp.dataset.deleteProduct);
    if(p){
      const used=db.transactions.some(t=>t.productId===p.id);
      const message=used
        ? `${p.name} has transaction history. Deleting it will remove the product from inventory but keep old transaction amounts in reports. Continue?`
        : `Delete ${p.name} permanently?`;
      if(window.confirm(message)){
        db.products=db.products.filter(x=>x.id!==p.id);
        saveDB();
      }
    }
  }
  const ec=e.target.closest("[data-edit-customer]");if(ec){const c=db.customers.find(x=>x.id===ec.dataset.editCustomer);if(c)openModal("customer",{customer:c})}
  const es=e.target.closest("[data-edit-supplier]");if(es){const s=db.suppliers.find(x=>x.id===es.dataset.editSupplier);if(s)openModal("supplier",{supplier:s})}
  const cs=e.target.closest("[data-customer-sale]");if(cs){navigate("transactions");openModal("udhar_sale",{customerId:cs.dataset.customerSale})}
  const cp=e.target.closest("[data-customer-pay]");if(cp)openModal("customer_payment",{id:cp.dataset.customerPay});
  const sp=e.target.closest("[data-supplier-pay]");if(sp)openModal("supplier_payment",{id:sp.dataset.supplierPay});
  const delTx=e.target.closest("[data-delete-transaction]");if(delTx)deleteTransaction(delTx.dataset.deleteTransaction);
  const et=e.target.closest("[data-edit-transaction]");if(et)editTransaction(et.dataset.editTransaction);
  const per=e.target.closest("[data-period]");if(per){reportPeriod=per.dataset.period;$$(".period").forEach(x=>x.classList.toggle("active",x===per));renderReports()}
});
$("#todayLabel").textContent=new Date().toLocaleDateString("en-PK",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
syncBrand();renderAll();startSingleShop();

// Mobile install support (PWA)
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.error));
}
