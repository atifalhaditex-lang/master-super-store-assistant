const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const makeId=()=> (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2));

const STORE_NAME="MASTER SUPER STORE";
const OWNER_NAME="SHOUKAT ALI TAHIR";
const LOCAL_STORE_KEY="master_super_store_single_shop_v10";

const SUPABASE_URL="https://cdnxkqjklzcteuojayll.supabase.co";
const SUPABASE_KEY="sb_publishable_m4gpy-uVfv8Hpld7wfo_Xw_Vh8wUeIO";

const CLOUD_TABLES={
  products:"mss_products",
  transactions:"mss_transactions",
  customers:"mss_customers",
  suppliers:"mss_suppliers"
};

let db=freshDB();
let reportPeriod="today", formContext=null;
let supa=null, cloudReady=false, isPersisting=false;
let lastSyncedDB=freshDB();
let syncChain=Promise.resolve();
let realtimeChannel=null;
let reloadTimer=null;

function freshDB(){
  return {
    settings:{shopName:STORE_NAME,ownerName:OWNER_NAME},
    products:[],
    transactions:[],
    customers:[],
    suppliers:[]
  };
}

function normalizeDB(data){
  const x=(data && typeof data==="object") ? structuredClone(data) : freshDB();
  x.settings={shopName:STORE_NAME,ownerName:OWNER_NAME};
  x.products=Array.isArray(x.products)?x.products:[];
  x.transactions=Array.isArray(x.transactions)?x.transactions:[];
  x.customers=Array.isArray(x.customers)?x.customers:[];
  x.suppliers=Array.isArray(x.suppliers)?x.suppliers:[];
  x.products.forEach(p=>{
    if(p.active===undefined)p.active=true;
    p.stock=Number(p.stock||0);
    p.avgCost=Number(p.avgCost||0);
    p.salePrice=Number(p.salePrice||0);
    p.minStock=Number(p.minStock||0);
  });
  x.customers.forEach(c=>c.balance=Number(c.balance||0));
  x.suppliers.forEach(s=>s.balance=Number(s.balance||0));
  return x;
}

function hasUsefulData(x){
  return !!(x?.products?.length || x?.transactions?.length || x?.customers?.length || x?.suppliers?.length);
}

function loadLocalData(){
  try{
    const raw=localStorage.getItem(LOCAL_STORE_KEY)
      || localStorage.getItem("master_super_store_single_shop_v8");
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return normalizeDB(parsed?.data||parsed);
  }catch(err){
    console.warn("Local data read failed",err);
    return null;
  }
}

function saveLocalData(){
  try{
    localStorage.setItem(LOCAL_STORE_KEY,JSON.stringify(db));
  }catch(err){
    console.warn("Local data save failed",err);
  }
}

function setSyncStatus(state,text){
  const el=$("#syncStatus");if(!el)return;
  el.className="sync-status "+state;
  el.innerHTML=`<span></span><b>${text}</b>`;
}

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
function productOptions(selected=""){
  return db.products
    .filter(p=>p.active!==false || p.id===selected)
    .map(p=>`<option value="${p.id}" ${p.id===selected?"selected":""}>${esc(p.name)} — ${formatQty(p.stock)} ${esc(p.unit)}</option>`)
    .join("");
}

const ALL_UNITS=["KG","Gram","Liter","ML","Piece","Packet","Box","Dozen","Carton","Bag","Bottle","Tin","Pouch"];
const PACK_UNITS=["Bag","Carton","Box","Dozen","Packet","Bottle","Tin","Pouch"];

function formatQty(v){
  const n=num(v);
  if(Number.isInteger(n))return String(n);
  return n.toLocaleString("en-PK",{maximumFractionDigits:3});
}

function naturalUnitFactor(fromUnit,toUnit){
  if(fromUnit===toUnit)return 1;
  const key=`${fromUnit}>${toUnit}`;
  const factors={
    "Gram>KG":0.001,
    "KG>Gram":1000,
    "ML>Liter":0.001,
    "Liter>ML":1000,
    "Dozen>Piece":12,
    "Piece>Dozen":1/12
  };
  return factors[key]??null;
}

function saleUnitsForProduct(p){
  if(!p)return [];
  const set=new Set([p.unit]);
  if(p.unit==="KG")set.add("Gram");
  if(p.unit==="Gram")set.add("KG");
  if(p.unit==="Liter")set.add("ML");
  if(p.unit==="ML")set.add("Liter");
  if(p.unit==="Piece")set.add("Dozen");
  if(p.unit==="Dozen")set.add("Piece");
  return [...set];
}

function purchaseUnitsForProduct(p){
  if(!p)return [];
  const set=new Set(saleUnitsForProduct(p));
  PACK_UNITS.forEach(u=>set.add(u));
  return [...set];
}

function needsPackSize(p,inputUnit){
  if(!p||!inputUnit||inputUnit===p.unit)return false;
  return naturalUnitFactor(inputUnit,p.unit)===null;
}

function toBaseQuantity(p,enteredQty,inputUnit,packSize=1){
  const q=num(enteredQty);
  if(!p||q<0)return NaN;
  if(inputUnit===p.unit)return q;
  const natural=naturalUnitFactor(inputUnit,p.unit);
  if(natural!==null)return q*natural;
  const size=num(packSize);
  if(size<=0)return NaN;
  return q*size;
}

function txBaseQty(t){
  return num(t.baseQuantity!==undefined?t.baseQuantity:t.quantity);
}

function txDisplayQty(t){
  const enteredQty=t.enteredQuantity!==undefined?t.enteredQuantity:t.quantity;
  const enteredUnit=t.enteredUnit||t.unit||"";
  const baseQty=txBaseQty(t);
  const baseUnit=t.unit||"";
  const main=`${formatQty(enteredQty)} ${enteredUnit}`.trim();
  if(enteredUnit && baseUnit && enteredUnit!==baseUnit){
    return `${main} = ${formatQty(baseQty)} ${baseUnit}`;
  }
  return main;
}

function unitOptions(units,selected){
  return units.map(u=>`<option value="${u}" ${u===selected?"selected":""}>${u}</option>`).join("");
}

function purchasePreviewText(p,enteredQty,purchaseUnit,packSize,totalAmount){
  if(!p)return "Select a product.";
  const baseQty=toBaseQuantity(p,enteredQty,purchaseUnit,packSize);
  if(!Number.isFinite(baseQty)||baseQty<=0)return `Enter purchase quantity in ${purchaseUnit||p.unit}.`;
  const total=num(totalAmount);
  const unitCost=total>0?total/baseQty:0;
  return `Stock +${formatQty(baseQty)} ${p.unit}${total>0?` · Cost ${money(unitCost)} / ${p.unit}`:""}`;
}

function movementPreviewText(p,enteredQty,inputUnit,rate){
  if(!p)return "Select a product.";
  const baseQty=toBaseQuantity(p,enteredQty,inputUnit,1);
  if(!Number.isFinite(baseQty)||baseQty<=0)return "Enter quantity.";
  const total=baseQty*num(rate||p.salePrice);
  return `${formatQty(enteredQty)} ${inputUnit} = ${formatQty(baseQty)} ${p.unit}${rate!==undefined?` · Amount ${money(total)}`:""}`;
}

function syncBrand(){
  document.title=STORE_NAME;
  $("#headerStoreName") && ($("#headerStoreName").textContent=STORE_NAME);
}

function navigate(v){
  $$(".view").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  $$(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.nav===v));
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
}

function initCloud(){
  if(!window.supabase?.createClient){
    setSyncStatus("local","Device Saved");
    return false;
  }
  try{
    supa=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      realtime:{params:{eventsPerSecond:5}}
    });
    return true;
  }catch(err){
    console.error(err);
    setSyncStatus("local","Device Saved");
    return false;
  }
}

async function cloudSelect(table){
  const {data,error}=await supa.from(table).select("id,data,updated_at");
  if(error)throw error;
  return data||[];
}

async function loadCloudDB(){
  const [products,transactions,customers,suppliers,settings] = await Promise.all([
    cloudSelect(CLOUD_TABLES.products),
    cloudSelect(CLOUD_TABLES.transactions),
    cloudSelect(CLOUD_TABLES.customers),
    cloudSelect(CLOUD_TABLES.suppliers),
    cloudSelect("mss_settings")
  ]);
  const settingRow=settings.find(x=>x.id==="master-super-store");
  return normalizeDB({
    settings:settingRow?.data||{shopName:STORE_NAME,ownerName:OWNER_NAME},
    products:products.map(x=>x.data),
    transactions:transactions.map(x=>x.data),
    customers:customers.map(x=>x.data),
    suppliers:suppliers.map(x=>x.data)
  });
}

function mapById(list){return new Map((list||[]).map(x=>[x.id,x]))}
function sameRecord(a,b){return JSON.stringify(a)===JSON.stringify(b)}

async function syncCollection(table,beforeList,nextList){
  const before=mapById(beforeList), next=mapById(nextList);
  const changed=[];
  const removed=[];
  const now=new Date().toISOString();

  for(const [id,item] of next){
    if(!before.has(id) || !sameRecord(before.get(id),item)){
      changed.push({id,data:item,updated_at:now});
    }
  }
  for(const id of before.keys()){
    if(!next.has(id))removed.push(id);
  }

  if(changed.length){
    const {error}=await supa.from(table).upsert(changed,{onConflict:"id"});
    if(error)throw error;
  }
  if(removed.length){
    const {error}=await supa.from(table).delete().in("id",removed);
    if(error)throw error;
  }
}

async function persistSnapshot(snapshot){
  if(!cloudReady||!supa)return;
  isPersisting=true;
  setSyncStatus("syncing","Saving");
  try{
    const before=lastSyncedDB;
    await syncCollection(CLOUD_TABLES.products,before.products,snapshot.products);
    await syncCollection(CLOUD_TABLES.transactions,before.transactions,snapshot.transactions);
    await syncCollection(CLOUD_TABLES.customers,before.customers,snapshot.customers);
    await syncCollection(CLOUD_TABLES.suppliers,before.suppliers,snapshot.suppliers);

    const {error:settingsError}=await supa.from("mss_settings").upsert({
      id:"master-super-store",
      data:{shopName:STORE_NAME,ownerName:OWNER_NAME},
      updated_at:new Date().toISOString()
    },{onConflict:"id"});
    if(settingsError)throw settingsError;

    lastSyncedDB=normalizeDB(snapshot);
    setSyncStatus("synced","Cloud Saved");
  }catch(err){
    console.error("Cloud save failed",err);
    setSyncStatus("local","Device Saved");
  }finally{
    isPersisting=false;
  }
}

function queueCloudSave(){
  if(!cloudReady||!supa)return;
  const snapshot=normalizeDB(db);
  syncChain=syncChain.then(()=>persistSnapshot(snapshot)).catch(err=>{
    console.error(err);
    setSyncStatus("local","Device Saved");
  });
}

function saveDB(){
  saveLocalData();
  syncBrand();
  renderAll();
  queueCloudSave();
}

async function uploadWholeDB(source){
  const empty=freshDB();
  lastSyncedDB=empty;
  await persistSnapshot(normalizeDB(source));
}

async function reloadFromCloud(){
  if(!cloudReady||isPersisting)return;
  try{
    const remote=await loadCloudDB();
    db=remote;
    lastSyncedDB=normalizeDB(remote);
    saveLocalData();
    renderAll();
    setSyncStatus("synced","Cloud Updated");
  }catch(err){
    console.error("Cloud reload failed",err);
    setSyncStatus("local","Device Saved");
  }
}

function scheduleCloudReload(){
  if(isPersisting)return;
  clearTimeout(reloadTimer);
  reloadTimer=setTimeout(reloadFromCloud,300);
}

function startRealtime(){
  if(!supa)return;
  if(realtimeChannel)supa.removeChannel(realtimeChannel);
  realtimeChannel=supa.channel("master-super-store-live-v10");
  for(const table of [...Object.values(CLOUD_TABLES),"mss_settings"]){
    realtimeChannel.on(
      "postgres_changes",
      {event:"*",schema:"public",table},
      ()=>scheduleCloudReload()
    );
  }
  realtimeChannel.subscribe(status=>{
    if(status==="SUBSCRIBED")setSyncStatus("synced","Cloud Live");
  });
}

async function startSingleShop(){
  syncBrand();

  const local=loadLocalData();
  db=local||freshDB();
  saveLocalData();
  renderAll();

  if(!initCloud())return;

  setSyncStatus("syncing","Connecting");
  try{
    const remote=await loadCloudDB();

    if(hasUsefulData(remote)){
      db=remote;
      lastSyncedDB=normalizeDB(remote);
      saveLocalData();
    }else if(hasUsefulData(db)){
      cloudReady=true;
      await uploadWholeDB(db);
      lastSyncedDB=normalizeDB(db);
    }else{
      lastSyncedDB=normalizeDB(remote);
    }

    cloudReady=true;
    renderAll();
    setSyncStatus("synced","Cloud Live");
    startRealtime();

    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible")scheduleCloudReload();
    },{passive:true});
    window.addEventListener("focus",scheduleCloudReload,{passive:true});
  }catch(err){
    console.error("Cloud connection failed",err);
    cloudReady=false;
    setSyncStatus("local","Device Saved");
  }
}
function activityRow(t){
  const names={sale:"Sale",purchase:"Purchase",home:"Home Use",loss:"Loss",expense:"Expense",adjustment:"Stock Adjustment",customer_payment:"Customer Payment",supplier_payment:"Supplier Payment"};
  const p=getProduct(t.productId);
  const productName=p?.name||t.productName||"";
  const party=t.customerId?(db.customers.find(c=>c.id===t.customerId)?.name||t.customerName||""):t.supplierId?(db.suppliers.find(s=>s.id===t.supplierId)?.name||t.supplierName||""):"";
  return `<div class="row-item activity-row"><div class="row-main"><strong>${names[t.type]||"Activity"}${productName?" · "+esc(productName):""}</strong><small>${fmt(t.date)}${party?" · "+esc(party):""}${t.note?" · "+esc(t.note):""}</small></div><div class="row-end"><span class="${["sale","customer_payment"].includes(t.type)?"amount-positive":"amount-negative"}">${money(t.total??t.value??0)}</span><button class="mini-delete" data-delete-transaction="${t.id}" type="button" aria-label="Delete transaction" title="Delete entry">×</button></div></div>`
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
  $("#lowStockList").innerHTML=low.length?low.slice(0,6).map(p=>`<div class="row-item"><div class="row-main"><strong>${esc(p.name)}</strong><small>${formatQty(p.stock)} ${esc(p.unit)} remaining</small></div><span class="badge warn">Min ${p.minStock}</span></div>`).join(""):`<div class="success-state"><span>✓</span><div><strong>Stock levels look healthy</strong><small>No product is below its minimum level.</small></div></div>`;
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
      <span class="stock-pill ${num(p.stock)<=num(p.minStock)?"low":""}">${formatQty(p.stock)} ${esc(p.unit)}</span>
    </div>
    <div class="product-metrics">
      <div><span>Cost / ${esc(p.unit)}</span><b>${money(p.avgCost)}</b></div>
      <div><span>Sale / ${esc(p.unit)}</span><b>${money(p.salePrice)}</b></div>
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
    const productName=p?.name||t.productName||"";
    const c=t.customerId?db.customers.find(x=>x.id===t.customerId):null;
    const s=t.supplierId?db.suppliers.find(x=>x.id===t.supplierId):null;
    const customerName=c?.name||t.customerName||"";
    const supplierName=s?.name||t.supplierName||"";
    return `<article class="activity-card">
      <div class="activity-top"><div><strong>${names[t.type]||t.type}</strong><div class="activity-meta">${fmt(t.date)}${productName?" · "+esc(productName):""}${customerName?" · "+esc(customerName):""}${supplierName?" · "+esc(supplierName):""}</div></div><span class="badge">${money(t.total??t.value??0)}</span></div>
      ${t.quantity?`<div class="product-bottom"><span>Qty <b>${esc(txDisplayQty(t))}</b></span>${t.rate?`<span>Rate / ${esc(t.unit||"unit")} <b>${money(t.rate)}</b></span>`:""}${t.profit!==undefined?`<span>Profit <b>${money(t.profit)}</b></span>`:""}</div>`:""}
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
  const sold={};l.filter(t=>t.type==="sale").forEach(t=>{sold[t.productId]=(sold[t.productId]||0)+txBaseQty(t)});
  const top=Object.entries(sold).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $("#topSellingList").innerHTML=top.length?top.map(([id,q])=>`<div class="row-item"><div class="row-main"><strong>${esc(getProduct(id)?.name||db.transactions.find(t=>t.productId===id&&t.productName)?.productName||"Deleted Product")}</strong><small>${formatQty(q)} ${esc(getProduct(id)?.unit||db.transactions.find(t=>t.productId===id)?.unit||"")} sold</small></div></div>`).join(""):`<div class="empty">No sales in this period.</div>`;
  const warnings=[];const low=db.products.filter(p=>p.active!==false && num(p.stock)<=num(p.minStock));if(low.length)warnings.push(`${low.length} item(s) low in stock.`);if(db.customers.some(c=>num(c.balance)>0))warnings.push("Customer udhar is pending.");if(db.suppliers.some(s=>num(s.balance)>0))warnings.push("Supplier payments are pending.");
  $("#reportWarnings").innerHTML=warnings.length?warnings.map(w=>`<div class="row-item"><div class="row-main"><strong>${esc(w)}</strong></div></div>`).join(""):`<div class="empty">No warnings.</div>`
}
function renderAll(){renderDashboard();renderInventory();renderTransactions();renderPeople();renderReports()}

function f(label,name,type="text",o={}){return `<div class="form-group${o.full?" full":""}"><label>${label}</label><input name="${name}" type="${type}" ${o.required?"required":""} ${o.min!==undefined?`min="${o.min}"`:""} ${o.step?`step="${o.step}"`:""} value="${esc(o.value??"")}"></div>`}
function sf(label,name,options,o={}){return `<div class="form-group${o.full?" full":""}"><label>${label}</label><select name="${name}" ${o.required?"required":""}>${options}</select></div>`}
function openModal(kind,ctx={}){
  formContext={kind,ctx};$("#formMessage").textContent="";const b=$("#modalBody"), t=$("#modalTitle");const d=todayISO();
  if(kind==="product"){
    const p=ctx.product||{};
    t.textContent=p.id?"Edit Product":"Add Product";
    b.innerHTML=`<div class="form-grid">
      ${f("Product Name","name","text",{required:true,value:p.name||""})}
      ${f("Category","category","text",{required:true,value:p.category||"Grocery"})}
      <div class="form-group full">
        <label>Stock Unit</label>
        <select name="unit" required>${unitOptions(ALL_UNITS,p.unit||"Piece")}</select>
        <small class="field-help">Choose the unit in which stock will be maintained. Example: Sugar = KG, Milk = Liter, Biscuits = Packet.</small>
      </div>
      ${p.id
        ?`<div class="form-group full"><div class="balance-info"><span>Current Stock</span><strong>${formatQty(p.stock)} ${esc(p.unit)}</strong><small>Use Adjust Stock to correct quantity; product Edit does not change stock.</small></div></div>`
        :f("Opening Stock","stock","number",{required:true,min:0,step:"0.001",value:p.stock??0})}
      ${f(p.id?"Current Purchase Cost / Stock Unit":"Opening Purchase Cost / Stock Unit","avgCost","number",{required:true,min:0,step:"0.01",value:p.avgCost??0})}
      ${f("Sale Price / Stock Unit","salePrice","number",{required:true,min:0,step:"0.01",value:p.salePrice??0})}
      ${f("Low Stock Alert / Stock Unit","minStock","number",{required:true,min:0,step:"0.001",value:p.minStock??0})}
    </div>`;
  }
  if(["sale","purchase","home","loss","adjustment"].includes(kind)){
    const pf=ctx.prefill||{};
    t.textContent={sale:"Add Sale",purchase:"Add Purchase",home:"Home Use",loss:"Loss / Wastage",adjustment:"Adjust Stock"}[kind];
    const paymentValue=pf.paymentType||ctx.paymentType||"cash";
    const customerValue=ctx.customerId||pf.customerId||"";
    const purchaseType=pf.purchaseType||"cash";
    const selectedProduct=getProduct(ctx.productId||pf.productId);
    const enteredQty=pf.enteredQuantity!==undefined?pf.enteredQuantity:(pf.quantity??"");
    const enteredUnit=pf.enteredUnit||pf.purchaseUnit||pf.unit||selectedProduct?.unit||"Piece";
    const packSize=pf.packSize||1;

    if(kind==="adjustment"){
      b.innerHTML=`<div class="form-grid">
        ${sf("Product","productId",`<option value="">Select product</option>${productOptions(ctx.productId||pf.productId)}`,{required:true,full:true})}
        ${f("Date","date","date",{required:true,value:pf.date||d})}
        <div class="form-group full">
          <label>Actual Stock <span class="dynamic-base-unit">${selectedProduct?`(${esc(selectedProduct.unit)})`:""}</span></label>
          <input name="quantity" type="number" required min="0" step="0.001" value="${esc(pf.newStock??pf.quantity??"")}">
          <small class="field-help">Stock adjustment is always entered in the product's Stock Unit.</small>
        </div>
      </div>`;
    }else{
      b.innerHTML=`<div class="form-grid">
        ${sf("Product","productId",`<option value="">Select product</option>${productOptions(ctx.productId||pf.productId)}`,{required:true,full:true})}
        ${f("Date","date","date",{required:true,value:pf.date||d})}
        <div class="form-group">
          <label>Quantity</label>
          <input name="quantity" type="number" required min="0.001" step="0.001" value="${esc(enteredQty)}">
        </div>
        <div class="form-group">
          <label>${kind==="purchase"?"Purchase Unit":"Unit"}</label>
          <select name="entryUnit" required></select>
        </div>

        ${kind==="purchase"?`
          <div class="form-group pack-size-group conditional-hidden">
            <label>Qty per Pack <span class="pack-base-label"></span></label>
            <input name="packSize" type="number" min="0.001" step="0.001" value="${esc(packSize)}">
            <small class="field-help">Example: 1 Sugar Bag = 50 KG, so enter 50.</small>
          </div>
          <div class="form-group">
            <label>Total Purchase Amount</label>
            <input name="totalPurchaseAmount" type="number" required min="0.01" step="0.01" value="${esc(pf.total??"")}">
            <small class="field-help">Enter the total bill amount. Cost per stock unit is calculated automatically.</small>
          </div>
          ${sf("Purchase Type","purchaseType",`<option value="cash" ${purchaseType==="cash"?"selected":""}>Cash</option><option value="credit" ${purchaseType==="credit"?"selected":""}>Credit / Pay Later</option>`,{full:true})}
          ${sf("Supplier","supplierId",`<option value="">No supplier</option>${db.suppliers.map(s=>`<option value="${s.id}" ${(pf.supplierId||"")===s.id?"selected":""}>${esc(s.name)} — ${money(s.balance)}</option>`).join("")}`,{full:true})}
          <div class="form-group full"><div class="conversion-preview purchase-preview">Select product and enter purchase details.</div></div>
        `:""}

        ${kind==="sale"?`
          <div class="form-group">
            <label>Sale Rate / Stock Unit</label>
            <input name="rate" type="number" min="0" step="0.01" value="${esc(pf.rate??selectedProduct?.salePrice??"")}">
            <small class="field-help">Example: if Sugar stock unit is KG, enter the selling rate per KG.</small>
          </div>
          ${sf("Payment Type","paymentType",`<option value="cash" ${paymentValue==="cash"?"selected":""}>Cash</option><option value="udhar" ${paymentValue==="udhar"?"selected":""}>Udhar / Credit</option>`,{full:true})}
          <div class="form-group full sale-customer-group">
            <label>Customer</label>
            <select name="customerId"><option value="">Select customer</option>${db.customers.map(c=>`<option value="${c.id}" ${customerValue===c.id?"selected":""}>${esc(c.name)} — ${money(c.balance)}</option>`).join("")}</select>
            <small class="field-help">Required only for Udhar sale.</small>
          </div>
          <div class="form-group full"><div class="conversion-preview movement-preview">Select product and quantity.</div></div>
        `:""}

        ${["home","loss"].includes(kind)?`
          ${kind==="loss"?sf("Reason","reason",["Expired","Damaged","Broken","Leakage","Missing","Theft","Other"].map(x=>`<option ${pf.note===x?"selected":""}>${x}</option>`).join("")):""}
          <div class="form-group full"><div class="conversion-preview movement-preview">Select product and quantity.</div></div>
        `:""}
      </div>`;
    }

    const productSelect=b.querySelector('[name="productId"]');
    const unitSelect=b.querySelector('[name="entryUnit"]');
    const qtyInput=b.querySelector('[name="quantity"]');
    const packGroup=b.querySelector(".pack-size-group");
    const packInput=b.querySelector('[name="packSize"]');
    const totalPurchase=b.querySelector('[name="totalPurchaseAmount"]');
    const rateInput=b.querySelector('[name="rate"]');
    const purchasePreview=b.querySelector(".purchase-preview");
    const movementPreview=b.querySelector(".movement-preview");
    const customerGroup=b.querySelector(".sale-customer-group");
    const customerSelect=b.querySelector('[name="customerId"]');
    const paymentSelect=b.querySelector('[name="paymentType"]');

    const refreshUnitUI=()=>{
      const p=getProduct(productSelect?.value);
      if(kind==="adjustment"){
        const label=b.querySelector(".dynamic-base-unit");
        if(label)label.textContent=p?`(${p.unit})`:"";
        return;
      }
      if(!unitSelect)return;
      const units=kind==="purchase"?purchaseUnitsForProduct(p):saleUnitsForProduct(p);
      const desired=unitSelect.value||enteredUnit||p?.unit||"";
      unitSelect.innerHTML=unitOptions(units,units.includes(desired)?desired:(p?.unit||units[0]));
      const selected=unitSelect.value;

      if(packGroup){
        const custom=needsPackSize(p,selected);
        packGroup.classList.toggle("conditional-hidden",!custom);
        if(packInput)packInput.required=custom;
        const baseLabel=b.querySelector(".pack-base-label");
        if(baseLabel)baseLabel.textContent=p?`(${p.unit})`:"";
      }

      if(kind==="purchase"&&purchasePreview){
        purchasePreview.textContent=purchasePreviewText(p,qtyInput?.value,selected,packInput?.value,totalPurchase?.value);
      }
      if(["sale","home","loss"].includes(kind)&&movementPreview){
        movementPreview.textContent=movementPreviewText(p,qtyInput?.value,selected,kind==="sale"?(rateInput?.value||p?.salePrice):undefined);
      }
    };

    productSelect?.addEventListener("change",()=>{
      if(unitSelect)unitSelect.value="";
      refreshUnitUI();
    });
    unitSelect?.addEventListener("change",refreshUnitUI);
    qtyInput?.addEventListener("input",refreshUnitUI);
    packInput?.addEventListener("input",refreshUnitUI);
    totalPurchase?.addEventListener("input",refreshUnitUI);
    rateInput?.addEventListener("input",refreshUnitUI);

    if(kind==="sale"){
      const updateCustomer=()=>{
        const udhar=paymentSelect?.value==="udhar";
        customerGroup?.classList.toggle("conditional-hidden",!udhar);
        if(customerSelect)customerSelect.required=!!udhar;
      };
      paymentSelect?.addEventListener("change",updateCustomer);
      updateCustomer();
    }

    refreshUnitUI();
  }
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
    if(p)p.stock=num(p.stock)+txBaseQty(t);
    if(t.paymentType==="udhar"&&t.customerId){
      const c=db.customers.find(x=>x.id===t.customerId);
      if(c)c.balance=Math.max(0,num(c.balance)-num(t.total));
    }
  }else if(t.type==="purchase"){
    if(p){
      p.stock=Math.max(0,num(p.stock)-txBaseQty(t));
      if(t.previousAvgCost!==undefined)p.avgCost=num(t.previousAvgCost);
    }
    if(t.purchaseType==="credit"&&t.supplierId){
      const s=db.suppliers.find(x=>x.id===t.supplierId);
      if(s)s.balance=Math.max(0,num(s.balance)-num(t.total));
    }
  }else if(t.type==="home"||t.type==="loss"){
    if(p)p.stock=num(p.stock)+txBaseQty(t);
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
    openModal("sale",{...common,productId:old.productId,customerId:old.customerId,paymentType:old.paymentType});
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
    else if(["sale","purchase","home","loss","adjustment"].includes(kind)){
      const p=getProduct(fd.get("productId"));if(!p)throw Error("Please select a product.");
      const enteredQty=num(fd.get("quantity")), date=fd.get("date");

      if(kind==="adjustment"){
        if(enteredQty<0)throw Error("Actual stock cannot be negative.");
        const old=num(p.stock);p.stock=enteredQty;
        const diff=Math.abs(enteredQty-old);
        db.transactions.push({
          id:makeId(),type:"adjustment",productId:p.id,productName:p.name,unit:p.unit,
          quantity:diff,baseQuantity:diff,enteredQuantity:diff,enteredUnit:p.unit,
          value:diff*num(p.avgCost),total:diff*num(p.avgCost),date,createdAt:now,
          note:`Stock ${formatQty(old)} ${p.unit} → ${formatQty(enteredQty)} ${p.unit}`,
          previousStock:old,newStock:enteredQty
        });
      }

      if(kind==="purchase"){
        if(enteredQty<=0)throw Error("Purchase quantity must be greater than 0.");
        const entryUnit=fd.get("entryUnit")||p.unit;
        const packSize=needsPackSize(p,entryUnit)?num(fd.get("packSize")):1;
        if(needsPackSize(p,entryUnit)&&packSize<=0)throw Error(`Enter how many ${p.unit} are in one ${entryUnit}.`);
        const baseQty=toBaseQuantity(p,enteredQty,entryUnit,packSize);
        if(!Number.isFinite(baseQty)||baseQty<=0)throw Error("Purchase quantity conversion is invalid.");

        const totalAmount=num(fd.get("totalPurchaseAmount"));
        if(totalAmount<=0)throw Error("Total Purchase Amount must be greater than 0.");

        const sid=fd.get("supplierId"), purchaseType=fd.get("purchaseType")||"cash";
        if(purchaseType==="credit"&&!sid)throw Error("Select a supplier for Credit / Pay Later purchase.");

        const oldQty=num(p.stock),oldAvgCost=num(p.avgCost),oldVal=oldQty*oldAvgCost;
        const unitCost=totalAmount/baseQty;
        p.stock=oldQty+baseQty;
        p.avgCost=(oldVal+totalAmount)/(p.stock||1);

        if(purchaseType==="credit"){
          const s=db.suppliers.find(x=>x.id===sid);if(!s)throw Error("Supplier not found.");
          s.balance=num(s.balance)+totalAmount;
        }

        db.transactions.push({
          id:makeId(),type:"purchase",productId:p.id,productName:p.name,unit:p.unit,
          quantity:baseQty,baseQuantity:baseQty,enteredQuantity:enteredQty,enteredUnit:entryUnit,
          packSize:needsPackSize(p,entryUnit)?packSize:null,rate:unitCost,total:totalAmount,
          date,createdAt:now,supplierId:sid,purchaseType,previousStock:oldQty,
          previousAvgCost:oldAvgCost,supplierName:db.suppliers.find(x=>x.id===sid)?.name||""
        });
      }

      if(["sale","home","loss"].includes(kind)){
        if(enteredQty<=0)throw Error("Quantity must be greater than 0.");
        const entryUnit=fd.get("entryUnit")||p.unit;
        const baseQty=toBaseQuantity(p,enteredQty,entryUnit,1);
        if(!Number.isFinite(baseQty)||baseQty<=0)throw Error("Quantity conversion is invalid.");
        if(baseQty>num(p.stock)+1e-9)throw Error(`Only ${formatQty(p.stock)} ${p.unit} available in stock.`);

        p.stock=Math.max(0,num(p.stock)-baseQty);
        const cost=baseQty*num(p.avgCost);

        if(kind==="sale"){
          const rate=num(fd.get("rate"))||num(p.salePrice);
          if(rate<0)throw Error("Sale rate is invalid.");
          const total=baseQty*rate,profit=total-cost,pay=fd.get("paymentType")||"cash",cid=fd.get("customerId");
          if(pay==="udhar"){
            if(!cid)throw Error("Select customer for Udhar sale.");
            const c=db.customers.find(x=>x.id===cid);if(!c)throw Error("Customer not found.");
            c.balance=num(c.balance)+total;
          }
          db.transactions.push({
            id:makeId(),type:"sale",productId:p.id,productName:p.name,unit:p.unit,
            quantity:baseQty,baseQuantity:baseQty,enteredQuantity:enteredQty,enteredUnit:entryUnit,
            rate,total,cost,profit,date,createdAt:now,paymentType:pay,customerId:cid||"",
            customerName:db.customers.find(x=>x.id===cid)?.name||""
          });
        }

        if(kind==="home")db.transactions.push({
          id:makeId(),type:"home",productId:p.id,productName:p.name,unit:p.unit,
          quantity:baseQty,baseQuantity:baseQty,enteredQuantity:enteredQty,enteredUnit:entryUnit,
          total:cost,date,createdAt:now
        });

        if(kind==="loss")db.transactions.push({
          id:makeId(),type:"loss",productId:p.id,productName:p.name,unit:p.unit,
          quantity:baseQty,baseQuantity:baseQty,enteredQuantity:enteredQty,enteredUnit:entryUnit,
          total:cost,date,createdAt:now,note:fd.get("reason")
        });
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
      if(used){
        alert(`${p.name} has transaction history, so it cannot be permanently deleted. Use Deactivate instead.`);
      }else if(window.confirm(`Delete ${p.name} permanently?`)){
        db.products=db.products.filter(x=>x.id!==p.id);
        saveDB();
      }
    }
  }
  const ec=e.target.closest("[data-edit-customer]");if(ec){const c=db.customers.find(x=>x.id===ec.dataset.editCustomer);if(c)openModal("customer",{customer:c})}
  const es=e.target.closest("[data-edit-supplier]");if(es){const s=db.suppliers.find(x=>x.id===es.dataset.editSupplier);if(s)openModal("supplier",{supplier:s})}
  const cs=e.target.closest("[data-customer-sale]");if(cs){navigate("transactions");openModal("sale",{customerId:cs.dataset.customerSale,paymentType:"udhar",prefill:{paymentType:"udhar"}})}
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
