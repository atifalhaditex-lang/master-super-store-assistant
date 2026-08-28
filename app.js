const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const DB_KEY="master_super_store_assistant_v1";
const makeId=()=> (crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2));
const seed={
  settings:{shopName:"MASTER SUPER STORE"},
  products:[
    {id:makeId(),name:"Sugar",category:"Grocery",unit:"KG",stock:25,avgCost:155,salePrice:170,minStock:10,active:true},
    {id:makeId(),name:"Cooking Oil",category:"Oil & Ghee",unit:"Liter",stock:12,avgCost:520,salePrice:560,minStock:5,active:true},
    {id:makeId(),name:"Tea Pack",category:"Tea & Beverages",unit:"Packet",stock:18,avgCost:245,salePrice:270,minStock:6,active:true},
    {id:makeId(),name:"Biscuits",category:"Biscuits & Snacks",unit:"Packet",stock:30,avgCost:70,salePrice:80,minStock:8,active:true}
  ],
  transactions:[],customers:[],suppliers:[]
};
const SUPABASE_URL="https://cdnxkqjklzcteuojayll.supabase.co";
const SUPABASE_KEY="sb_publishable_m4gpy-uVfv8Hpld7wfo_Xw_Vh8wUeIO";
const supa=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let db=loadDB(), reportPeriod="today", formContext=null, currentUser=null, cloudSaveTimer=null, cloudReady=false;
db.products.forEach(p=>{ if(p.active===undefined) p.active=true; });

function loadDB(){try{const x=JSON.parse(localStorage.getItem(DB_KEY));if(x)return x}catch(e){}localStorage.setItem(DB_KEY,JSON.stringify(seed));return structuredClone(seed)}
function setSyncStatus(state,text){
  const el=$("#syncStatus"); if(!el)return;
  el.className="sync-status "+state;
  el.innerHTML=`<span></span> ${text}`;
}
function queueCloudSave(){
  if(!cloudReady||!currentUser)return;
  clearTimeout(cloudSaveTimer);
  setSyncStatus("syncing","Saving");
  cloudSaveTimer=setTimeout(saveCloudData,450);
}
async function saveCloudData(){
  if(!cloudReady||!currentUser)return;
  try{
    const {error}=await supa.from("store_data").upsert({
      user_id:currentUser.id,
      data:db,
      updated_at:new Date().toISOString()
    },{onConflict:"user_id"});
    if(error)throw error;
    setSyncStatus("synced","Saved");
  }catch(err){
    console.error(err);
    setSyncStatus("error","Offline");
  }
}
function saveDB(){localStorage.setItem(DB_KEY,JSON.stringify(db));syncBrand();renderAll();queueCloudSave()}
function money(v){return "Rs "+Number(v||0).toLocaleString("en-PK",{maximumFractionDigits:2})}
function num(v){return Number(v||0)}
function todayISO(){return new Date().toISOString().slice(0,10)}
function monthISO(){return todayISO().slice(0,7)}
function fmt(d){return new Date((d||todayISO())+"T12:00:00").toLocaleDateString("en-PK",{day:"2-digit",month:"short",year:"numeric"})}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function getProduct(id){return db.products.find(p=>p.id===id)}
function matchPeriod(t,p){const d=t.date||t.createdAt?.slice(0,10);return p==="today"?d===todayISO():p==="month"?d?.slice(0,7)===monthISO():true}
function productOptions(selected=""){return db.products.filter(p=>p.active!==false || p.id===selected).map(p=>`<option value="${p.id}" ${p.id===selected?"selected":""}>${esc(p.name)} — ${p.stock} ${esc(p.unit)}</option>`).join("")}
function syncBrand(){document.title=db.settings.shopName;$("#loginStoreName").textContent=db.settings.shopName;$("#headerStoreName").textContent=db.settings.shopName}
function navigate(v){$$(".view").forEach(x=>x.classList.toggle("active",x.dataset.view===v));$$(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.nav===v));window.scrollTo({top:0,behavior:"smooth"})}


async function loadCloudData(){
  if(!currentUser)return;
  setSyncStatus("syncing","Loading");
  const {data,error}=await supa.from("store_data").select("data").eq("user_id",currentUser.id).maybeSingle();
  if(error)throw error;
  if(data?.data && Object.keys(data.data).length){
    db=data.data;
    db.settings=db.settings||{shopName:"MASTER SUPER STORE"};
    db.products=db.products||[]; db.transactions=db.transactions||[]; db.customers=db.customers||[]; db.suppliers=db.suppliers||[];
    db.products.forEach(p=>{if(p.active===undefined)p.active=true});
    localStorage.setItem(DB_KEY,JSON.stringify(db));
  }else{
    const chosenShop=(currentUser?.user_metadata?.shop_name||"").trim();
    if(chosenShop){db.settings=db.settings||{};db.settings.shopName=chosenShop.toUpperCase();}
    await supa.from("store_data").upsert({user_id:currentUser.id,data:db,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  }
  cloudReady=true;
  syncBrand();renderAll();
  setSyncStatus("synced","Saved");
}
async function showAppForUser(user){
  currentUser=user;
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  try{await loadCloudData()}catch(err){
    console.error(err);
    cloudReady=false;
    setSyncStatus("error","Offline");
    renderAll();
  }
}
const PRODUCTION_APP_URL="https://atifalhaditex-lang.github.io/master-super-store-assistant/";

function friendlyAuthError(error){
  const m=String(error?.message||"Authentication request failed.");
  if(/invalid login credentials/i.test(m)) return "Email or password is incorrect.";
  if(/email not confirmed/i.test(m)) return "Please confirm your email first, then sign in.";
  if(/user already registered/i.test(m)) return "This email already has an account. Please use Sign In or Forgot password.";
  if(/email rate limit/i.test(m)) return "Too many email requests. Please wait a little and try again.";
  if(/error sending confirmation email/i.test(m)) return "Confirmation email could not be sent. Please try again in a moment.";
  return m;
}
function setAuthMessage(message="",type=""){const el=$("#authMessage");if(!el)return;el.textContent=message;el.className="auth-message"+(type?` ${type}`:"");}
function setAuthBusy(id,busy,busyText){const btn=$("#"+id);if(!btn)return;if(!btn.dataset.normalText)btn.dataset.normalText=btn.querySelector("span")?.textContent||btn.textContent;btn.disabled=busy;const span=btn.querySelector("span");if(span)span.textContent=busy?busyText:btn.dataset.normalText;}
function switchAuthMode(mode){
  const login=mode==="login",register=mode==="register",recovery=mode==="recovery";
  $("#loginForm")?.classList.toggle("hidden",!login);$("#registerForm")?.classList.toggle("hidden",!register);$("#recoveryForm")?.classList.toggle("hidden",!recovery);
  $("#loginTab")?.classList.toggle("active",login);$("#registerTab")?.classList.toggle("active",register);$(".auth-tabs")?.classList.toggle("hidden",recovery);
  if($("#authSubheading"))$("#authSubheading").textContent=login?"Secure cloud access for stock, sales, udhar, expenses & profit.":register?"Create a private store account. Keep MASTER SUPER STORE or enter another shop name.":"Choose a new secure password for your store account.";
  setAuthMessage("");
  $("#resendConfirmationBtn")?.classList.add("hidden");
}
function togglePassword(id,button){const input=$("#"+id);if(!input)return;const show=input.type==="password";input.type=show?"text":"password";button.textContent=show?"Hide":"Show";}
async function loginUser(email,password){
  if(!email||!password){setAuthMessage("Enter email and password.","error");return}
  setAuthBusy("loginSubmit",true,"Signing in…");setAuthMessage("Checking your secure account…","info");
  try{const {data,error}=await supa.auth.signInWithPassword({email,password});if(error)throw error;setAuthMessage("");await showAppForUser(data.user);}
  catch(error){setAuthMessage(friendlyAuthError(error),"error")}finally{setAuthBusy("loginSubmit",false,"")}
}
async function registerUser(){
  const owner=$("#registerOwnerName")?.value.trim(),shop=($("#registerShopName")?.value.trim()||"MASTER SUPER STORE").toUpperCase(),email=$("#registerEmail")?.value.trim(),password=$("#registerPassword")?.value||"",confirm=$("#registerPasswordConfirm")?.value||"";
  if(!owner||!shop||!email||!password||!confirm){setAuthMessage("Please complete all account fields.","error");return}
  if(password.length<8||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password)){setAuthMessage("Use at least 8 characters with letters and a number.","error");return}
  if(password!==confirm){setAuthMessage("Passwords do not match.","error");return}
  setAuthBusy("registerSubmit",true,"Creating account…");setAuthMessage("Creating your private store account…","info");
  try{
    const {data:result,error}=await supa.auth.signUp({email,password,options:{data:{full_name:owner,shop_name:shop},emailRedirectTo:PRODUCTION_APP_URL}});
    if(error)throw error;
    if(result.session&&result.user){db.settings=db.settings||{};db.settings.shopName=shop;localStorage.setItem(DB_KEY,JSON.stringify(db));await showAppForUser(result.user);}
    else{switchAuthMode("login");if($("#loginEmail"))$("#loginEmail").value=email;setAuthMessage("Account created. Please confirm the email, then sign in. If no email arrives, use Resend confirmation email below.","success");
      const resend=$("#resendConfirmationBtn");if(resend)resend.classList.remove("hidden");}
    $("#registerForm")?.reset();if($("#registerOwnerName"))$("#registerOwnerName").value="SHOUKAT ALI";if($("#registerShopName"))$("#registerShopName").value="MASTER SUPER STORE";
  }catch(error){setAuthMessage(friendlyAuthError(error),"error")}finally{setAuthBusy("registerSubmit",false,"")}
}
async function resendConfirmationEmail(){
  const email=($("#loginEmail")?.value||$("#registerEmail")?.value||"").trim();
  if(!email){setAuthMessage("Enter the email address first.","error");return}
  const btn=$("#resendConfirmationBtn");
  if(btn){btn.disabled=true;btn.textContent="Sending…";}
  try{
    const {error}=await supa.auth.resend({
      type:"signup",
      email,
      options:{emailRedirectTo:PRODUCTION_APP_URL}
    });
    if(error)throw error;
    setAuthMessage("Confirmation email requested again. Check Inbox, Spam and Junk folders.","success");
  }catch(error){
    setAuthMessage(friendlyAuthError(error),"error");
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Resend confirmation email";}
  }
}
async function sendPasswordReset(){
  const email=$("#loginEmail")?.value.trim();if(!email){setAuthMessage("Enter your email first, then press Forgot password.","error");$("#loginEmail")?.focus();return}
  setAuthMessage("Sending password reset email…","info");
  try{const {error}=await supa.auth.resetPasswordForEmail(email,{redirectTo:PRODUCTION_APP_URL});if(error)throw error;setAuthMessage("Password reset email sent. Check your inbox.","success");}
  catch(error){setAuthMessage(friendlyAuthError(error),"error")}
}
async function updateRecoveredPassword(event){
  event.preventDefault();const p=$("#recoveryPassword")?.value||"",c=$("#recoveryPasswordConfirm")?.value||"";
  if(p.length<8||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p)){setAuthMessage("Use at least 8 characters with letters and a number.","error");return}
  if(p!==c){setAuthMessage("Passwords do not match.","error");return}
  setAuthBusy("recoverySubmit",true,"Updating…");
  try{const {error}=await supa.auth.updateUser({password:p});if(error)throw error;switchAuthMode("login");setAuthMessage("Password updated. You can continue securely.","success");}
  catch(error){setAuthMessage(friendlyAuthError(error),"error")}finally{setAuthBusy("recoverySubmit",false,"")}
}
async function logoutUser(){
  await saveCloudData();await supa.auth.signOut();currentUser=null;cloudReady=false;$("#modal")?.close();$("#appShell").classList.add("hidden");$("#loginScreen").classList.remove("hidden");if($("#loginPassword"))$("#loginPassword").value="";switchAuthMode("login");setAuthMessage("Signed out securely.","success");
}
async function restoreSession(){
  const {data}=await supa.auth.getSession();if(data.session?.user)await showAppForUser(data.session.user);
  supa.auth.onAuthStateChange(async(event,session)=>{if(event==="PASSWORD_RECOVERY"){$("#appShell").classList.add("hidden");$("#loginScreen").classList.remove("hidden");switchAuthMode("recovery")}});
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
      <div><span>Cost</span><b>${money(p.avgCost)}</b></div>
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
  $("#reportSales").textContent=money(sales);$("#reportGross").textContent=money(gross);$("#reportExpenses").textContent=money(expenses);$("#reportNet").textContent=money(gross-expenses);$("#reportHome").textContent=money(home);$("#reportLoss").textContent=money(loss);$("#reportPurchases").textContent=money(purchases);$("#reportStock").textContent=money(stock);
  const sold={};l.filter(t=>t.type==="sale").forEach(t=>{sold[t.productId]=(sold[t.productId]||0)+num(t.quantity)});
  const top=Object.entries(sold).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $("#topSellingList").innerHTML=top.length?top.map(([id,q])=>`<div class="row-item"><div class="row-main"><strong>${esc(getProduct(id)?.name||"Deleted Product")}</strong><small>${q} sold</small></div></div>`).join(""):`<div class="empty">No sales in this period.</div>`;
  const warnings=[];const low=db.products.filter(p=>p.active!==false && num(p.stock)<=num(p.minStock));if(low.length)warnings.push(`${low.length} item(s) low in stock.`);if(db.customers.some(c=>num(c.balance)>0))warnings.push("Customer udhar is pending.");if(db.suppliers.some(s=>num(s.balance)>0))warnings.push("Supplier payments are pending.");
  $("#reportWarnings").innerHTML=warnings.length?warnings.map(w=>`<div class="row-item"><div class="row-main"><strong>${esc(w)}</strong></div></div>`).join(""):`<div class="empty">No warnings.</div>`
}
function renderAll(){renderDashboard();renderInventory();renderTransactions();renderPeople();renderReports()}

function f(label,name,type="text",o={}){return `<div class="form-group${o.full?" full":""}"><label>${label}</label><input name="${name}" type="${type}" ${o.required?"required":""} ${o.min!==undefined?`min="${o.min}"`:""} ${o.step?`step="${o.step}"`:""} value="${esc(o.value??"")}"></div>`}
function sf(label,name,options,o={}){return `<div class="form-group${o.full?" full":""}"><label>${label}</label><select name="${name}" ${o.required?"required":""}>${options}</select></div>`}
function openModal(kind,ctx={}){
  formContext={kind,ctx};$("#formMessage").textContent="";const b=$("#modalBody"), t=$("#modalTitle");const d=todayISO();
  if(kind==="product"){const p=ctx.product||{};t.textContent=p.id?"Edit Product":"Add Product";b.innerHTML=`<div class="form-grid">${f("Product Name","name","text",{required:true,value:p.name||""})}${f("Category","category","text",{required:true,value:p.category||"Grocery"})}${sf("Unit","unit",["KG","Gram","Liter","ML","Piece","Packet","Box","Dozen","Carton","Bag","Bottle","Tin","Pouch"].map(u=>`<option ${p.unit===u?"selected":""}>${u}</option>`).join(""))}${f("Opening Stock","stock","number",{required:true,min:0,step:"0.01",value:p.stock??0})}${f("Average Cost","avgCost","number",{required:true,min:0,step:"0.01",value:p.avgCost??0})}${f("Sale Price","salePrice","number",{required:true,min:0,step:"0.01",value:p.salePrice??0})}${f("Low Stock Alert","minStock","number",{required:true,min:0,step:"0.01",value:p.minStock??0})}</div>`}
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
  if(["sale","purchase","home","loss","adjustment"].includes(kind)){const pf=ctx.prefill||{};t.textContent={sale:"Add Cash Sale",purchase:"Add Purchase",home:"Home Use",loss:"Loss / Wastage",adjustment:"Adjust Stock"}[kind];b.innerHTML=`<div class="form-grid">${sf("Product","productId",productOptions(ctx.productId||pf.productId),{required:true,full:true})}${f("Date","date","date",{required:true,value:pf.date||d})}${f(kind==="adjustment"?"Actual Stock":"Quantity","quantity","number",{required:true,min:0,step:"0.01",value:pf.quantity||""})}${kind==="sale"?f("Sale Rate","rate","number",{min:0,step:"0.01",value:pf.rate||""}):""}${kind==="purchase"?f("Purchase Rate","rate","number",{min:0,step:"0.01",required:true,value:pf.rate||""}):""}${kind==="sale"?sf("Payment Type","paymentType",`<option value="cash" ${(pf.paymentType||"cash")==="cash"?"selected":""}>Cash</option><option value="udhar" ${pf.paymentType==="udhar"?"selected":""}>Udhar / Credit</option>`):""}${kind==="sale"?sf("Customer","customerId",`<option value="">Select customer</option>${db.customers.map(c=>`<option value="${c.id}" ${(ctx.customerId||pf.customerId)===c.id?"selected":""}>${esc(c.name)}</option>`).join("")}`,{full:true}):""}${kind==="purchase"?sf("Supplier","supplierId",`<option value="">Cash / No supplier</option>${db.suppliers.map(s=>`<option value="${s.id}" ${(pf.supplierId||"")===s.id?"selected":""}>${esc(s.name)}</option>`).join("")}`,{full:true}):""}${kind==="purchase"?sf("Purchase Type","purchaseType",`<option value="cash" ${pf.purchaseType==="cash"?"selected":""}>Cash</option><option value="credit" ${pf.purchaseType==="credit"?"selected":""}>Credit / Pay Later</option>`):""}${kind==="loss"?sf("Reason","reason",["Expired","Damaged","Broken","Leakage","Missing","Theft","Other"].map(x=>`<option ${pf.note===x?"selected":""}>${x}</option>`).join("")):""}</div>`}
  if(kind==="expense"){const pf=ctx.prefill||{};const raw=(pf.note||"").split(" · ");const cat=raw[0]||"Miscellaneous", note=raw.slice(1).join(" · ");t.textContent="Add Expense";b.innerHTML=`<div class="form-grid">${f("Date","date","date",{required:true,value:pf.date||d})}${sf("Category","category",["Electricity","Rent","Transport","Loading","Labour","Fuel","Repair","Mobile","Bags","Miscellaneous"].map(x=>`<option ${x===cat?"selected":""}>${x}</option>`).join(""))}${f("Amount","amount","number",{required:true,min:0,step:"0.01",value:pf.total||""})}${f("Note","note","text",{full:true,value:note})}</div>`}
  if(kind==="customer"){const c=ctx.customer||{};t.textContent=c.id?"Edit Customer":"Add Customer";b.innerHTML=`<div class="form-grid">${f("Customer Name","name","text",{required:true,value:c.name||""})}${f("Phone","phone","text",{value:c.phone||""})}${c.id?`<div class="form-group full"><div class="balance-info"><span>Current Balance</span><strong>${money(c.balance)}</strong><small>Balance is changed through Udhar Sale / Receive Payment, not from profile edit.</small></div></div>`:f("Opening Balance","balance","number",{min:0,step:"0.01",value:0})}</div>`}
  if(kind==="supplier"){const s=ctx.supplier||{};t.textContent=s.id?"Edit Supplier":"Add Supplier";b.innerHTML=`<div class="form-grid">${f("Supplier Name","name","text",{required:true,value:s.name||""})}${f("Phone","phone","text",{value:s.phone||""})}${s.id?`<div class="form-group full"><div class="balance-info"><span>Current Payable</span><strong>${money(s.balance)}</strong><small>Payable is changed through credit purchases / supplier payments.</small></div></div>`:f("Opening Balance","balance","number",{min:0,step:"0.01",value:0})}</div>`}
  if(kind==="customer_payment"||kind==="supplier_payment"){const pf=ctx.prefill||{};t.textContent=kind==="customer_payment"?"Receive Customer Payment":"Pay Supplier";b.innerHTML=`<div class="form-grid">${f("Date","date","date",{required:true,value:pf.date||d})}${f("Amount","amount","number",{required:true,min:0.01,step:"0.01",value:pf.total||""})}${f("Note","note","text",{full:true,value:pf.note||""})}</div>`}
  if(kind==="settings"){t.textContent="Store Settings";b.innerHTML=`<div class="form-grid">${f("Shop Name","shopName","text",{required:true,value:db.settings.shopName,full:true})}<div class="form-group full"><div class="balance-info"><span>Cloud Account</span><strong id="settingsAccountEmail">Signed in securely</strong><small>Shop name can be different for every store account.</small></div></div></div><button class="secondary-btn logout-modal-btn" id="logoutBtn" type="button">Log Out</button>`;setTimeout(()=>{const el=$("#settingsAccountEmail");if(el&&currentUser)el.textContent=currentUser.email||"Signed in securely";const lo=$("#logoutBtn");if(lo)lo.addEventListener("click",logoutUser)},0)}
  $("#modal").showModal()
}


function deleteTransaction(id){
  const t=db.transactions.find(x=>x.id===id);
  if(!t)return;
  const p=getProduct(t.productId);

  const labels={
    sale:"sale",purchase:"purchase",home:"home-use",loss:"loss/wastage",
    expense:"expense",adjustment:"stock adjustment",
    customer_payment:"customer payment",supplier_payment:"supplier payment"
  };
  if(!window.confirm(`Delete this ${labels[t.type]||"entry"} of ${money(t.total??t.value??0)}? This will reverse its effect where possible.`))return;

  // Reverse stock/account effects
  if(t.type==="sale"){
    if(p) p.stock=num(p.stock)+num(t.quantity);
    if(t.paymentType==="udhar" && t.customerId){
      const c=db.customers.find(x=>x.id===t.customerId);
      if(c) c.balance=Math.max(0,num(c.balance)-num(t.total));
    }
  }

  if(t.type==="home" || t.type==="loss"){
    if(p) p.stock=num(p.stock)+num(t.quantity);
  }

  if(t.type==="purchase"){
    if(p){
      const qty=num(t.quantity);
      if(t.previousStock!==undefined && t.previousAvgCost!==undefined){
        p.stock=num(t.previousStock);
        p.avgCost=num(t.previousAvgCost);
      }else{
        // Compatibility with old V1 purchases: stock can be reversed safely.
        p.stock=Math.max(0,num(p.stock)-qty);
        // Old purchases did not store the prior weighted-average cost, so keep current avg cost.
      }
    }
    if(t.purchaseType==="credit" && t.supplierId){
      const s=db.suppliers.find(x=>x.id===t.supplierId);
      if(s) s.balance=Math.max(0,num(s.balance)-num(t.total));
    }
  }

  if(t.type==="adjustment" && p){
    if(t.previousStock!==undefined){
      p.stock=num(t.previousStock);
    }else{
      const m=String(t.note||"").match(/Stock\s+([0-9.]+)\s+→/);
      if(m) p.stock=num(m[1]);
    }
  }

  if(t.type==="customer_payment"){
    const c=db.customers.find(x=>x.name===t.note) || db.customers.find(x=>x.id===t.customerId);
    if(c) c.balance=num(c.balance)+num(t.total);
  }

  if(t.type==="supplier_payment"){
    const s=db.suppliers.find(x=>x.name===t.note) || db.suppliers.find(x=>x.id===t.supplierId);
    if(s) s.balance=num(s.balance)+num(t.total);
  }

  // Expense has no stock/account balance to restore.
  db.transactions=db.transactions.filter(x=>x.id!==id);
  saveDB();
}


function reverseTransaction(t){
  if(!t) return;
  const p=t.productId?getProduct(t.productId):null;
  if(t.type==="sale"){
    if(p) p.stock=num(p.stock)+num(t.quantity);
    if(t.paymentType==="udhar"&&t.customerId){
      const c=db.customers.find(x=>x.id===t.customerId);
      if(c)c.balance=Math.max(0,num(c.balance)-num(t.total));
    }
  } else if(t.type==="purchase"){
    if(p){
      const currentQty=num(p.stock), removeQty=num(t.quantity);
      const currentValue=currentQty*num(p.avgCost);
      const remainingQty=Math.max(0,currentQty-removeQty);
      const remainingValue=Math.max(0,currentValue-num(t.total));
      p.stock=remainingQty;
      p.avgCost=remainingQty>0?remainingValue/remainingQty:0;
    }
    if(t.purchaseType==="credit"&&t.supplierId){
      const s=db.suppliers.find(x=>x.id===t.supplierId);
      if(s)s.balance=Math.max(0,num(s.balance)-num(t.total));
    }
  } else if(t.type==="home"||t.type==="loss"){
    if(p)p.stock=num(p.stock)+num(t.quantity);
  } else if(t.type==="adjustment"){
    if(p && t.beforeStock!==undefined)p.stock=num(t.beforeStock);
  } else if(t.type==="customer_payment"){
    const c=db.customers.find(x=>x.id===t.customerId);
    if(c)c.balance=num(c.balance)+num(t.total);
  } else if(t.type==="supplier_payment"){
    const s=db.suppliers.find(x=>x.id===t.supplierId);
    if(s)s.balance=num(s.balance)+num(t.total);
  }
}
function deleteTransaction(id){
  const t=db.transactions.find(x=>x.id===id);
  if(!t)return;
  const labels={sale:"sale",purchase:"purchase",home:"home-use",loss:"loss",expense:"expense",adjustment:"stock adjustment",customer_payment:"customer payment",supplier_payment:"supplier payment"};
  const msg=`Delete this ${labels[t.type]||"entry"} of ${money(t.total??t.value??0)}? Stock, profit and khata/payable effects will be reversed automatically.`;
  if(!window.confirm(msg))return;
  reverseTransaction(t);
  db.transactions=db.transactions.filter(x=>x.id!==id);
  saveDB();
}
function editTransaction(id){
  const old=db.transactions.find(x=>x.id===id);
  if(!old)return;
  const editable=["sale","purchase","home","loss","expense","adjustment","customer_payment","supplier_payment"];
  if(!editable.includes(old.type))return;

  reverseTransaction(old);
  db.transactions=db.transactions.filter(x=>x.id!==id);
  saveDB();

  if(old.type==="sale"){
    openModal(old.paymentType==="udhar"?"udhar_sale":"sale",{productId:old.productId,customerId:old.customerId,prefill:old});
  } else if(old.type==="customer_payment"){
    openModal("customer_payment",{id:old.customerId,prefill:old});
  } else if(old.type==="supplier_payment"){
    openModal("supplier_payment",{id:old.supplierId,prefill:old});
  } else if(old.type==="adjustment"){
    openModal("adjustment",{productId:old.productId,prefill:{...old,quantity:old.afterStock??old.quantity}});
  } else {
    openModal(old.type,{productId:old.productId,prefill:old});
  }
}
function saveForm(fd){
  const {kind,ctx}=formContext, now=new Date().toISOString();
  if(kind==="product"){const obj={name:fd.get("name").trim(),category:fd.get("category").trim(),unit:fd.get("unit"),stock:num(fd.get("stock")),avgCost:num(fd.get("avgCost")),salePrice:num(fd.get("salePrice")),minStock:num(fd.get("minStock"))};if(ctx.product){Object.assign(ctx.product,obj)}else db.products.push({id:makeId(),active:true,...obj})}
  else if(kind==="udhar_sale"){
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
  if(["sale","purchase","home","loss","adjustment"].includes(kind)){
    const p=getProduct(fd.get("productId"));if(!p)throw Error("Please select a product.");const q=num(fd.get("quantity")), date=fd.get("date");
    if(kind==="adjustment"){const old=p.stock;p.stock=q;db.transactions.push({id:makeId(),type:"adjustment",productId:p.id,quantity:Math.abs(q-old),value:Math.abs(q-old)*p.avgCost,total:Math.abs(q-old)*p.avgCost,date,createdAt:now,note:`Stock ${old} → ${q}`,previousStock:old,newStock:q})}
    if(kind==="purchase"){if(q<=0)throw Error("Quantity must be greater than 0.");const rate=num(fd.get("rate"));const oldQty=num(p.stock), oldAvgCost=num(p.avgCost), oldVal=oldQty*oldAvgCost, addVal=q*rate;p.stock=oldQty+q;p.avgCost=(oldVal+addVal)/(p.stock||1);const total=addVal;const sid=fd.get("supplierId"), purchaseType=fd.get("purchaseType");if(purchaseType==="credit"&&sid){const s=db.suppliers.find(x=>x.id===sid);if(s)s.balance=num(s.balance)+total}db.transactions.push({id:makeId(),type:"purchase",productId:p.id,quantity:q,rate,total,date,createdAt:now,supplierId:sid,purchaseType,previousStock:oldQty,previousAvgCost:oldAvgCost})}
    if(["sale","home","loss"].includes(kind)){if(q<=0)throw Error("Quantity must be greater than 0.");if(q>num(p.stock))throw Error(`Only ${p.stock} ${p.unit} available in stock.`);p.stock=num(p.stock)-q;const cost=q*num(p.avgCost);
      if(kind==="sale"){const rate=num(fd.get("rate"))||num(p.salePrice),total=q*rate,profit=total-cost,pay=fd.get("paymentType"),cid=fd.get("customerId");if(pay==="udhar"){if(!cid)throw Error("Select customer for udhar sale.");const c=db.customers.find(x=>x.id===cid);c.balance=num(c.balance)+total}db.transactions.push({id:makeId(),type:"sale",productId:p.id,quantity:q,rate,total,cost,profit,date,createdAt:now,paymentType:pay,customerId:cid})}
      if(kind==="home")db.transactions.push({id:makeId(),type:"home",productId:p.id,quantity:q,total:cost,date,createdAt:now});
      if(kind==="loss")db.transactions.push({id:makeId(),type:"loss",productId:p.id,quantity:q,total:cost,date,createdAt:now,note:fd.get("reason")});
    }
  } else if(kind==="expense"){db.transactions.push({id:makeId(),type:"expense",total:num(fd.get("amount")),date:fd.get("date"),createdAt:now,note:`${fd.get("category")}${fd.get("note")?" · "+fd.get("note"):""}`})}
  else if(kind==="customer"){if(ctx.customer){ctx.customer.name=fd.get("name").trim();ctx.customer.phone=fd.get("phone").trim()}else db.customers.push({id:makeId(),name:fd.get("name").trim(),phone:fd.get("phone").trim(),balance:num(fd.get("balance"))})}
  else if(kind==="supplier"){if(ctx.supplier){ctx.supplier.name=fd.get("name").trim();ctx.supplier.phone=fd.get("phone").trim()}else db.suppliers.push({id:makeId(),name:fd.get("name").trim(),phone:fd.get("phone").trim(),balance:num(fd.get("balance"))})}
  else if(kind==="customer_payment"){const c=db.customers.find(x=>x.id===ctx.id), amount=num(fd.get("amount"));if(!c)throw Error("Customer not found.");c.balance=Math.max(0,num(c.balance)-amount);db.transactions.push({id:makeId(),type:"customer_payment",customerId:c.id,total:amount,date:fd.get("date"),createdAt:now,note:fd.get("note")?.trim()||c.name})}
  else if(kind==="supplier_payment"){const s=db.suppliers.find(x=>x.id===ctx.id), amount=num(fd.get("amount"));if(!s)throw Error("Supplier not found.");s.balance=Math.max(0,num(s.balance)-amount);db.transactions.push({id:makeId(),type:"supplier_payment",supplierId:s.id,total:amount,date:fd.get("date"),createdAt:now,note:fd.get("note")?.trim()||s.name})}
  else if(kind==="settings"){db.settings.shopName=fd.get("shopName").trim().toUpperCase()}
  saveDB()
}


$("#loginForm").addEventListener("submit",async e=>{e.preventDefault();await loginUser($("#loginEmail").value.trim(),$("#loginPassword").value)});
$("#registerForm").addEventListener("submit",async e=>{e.preventDefault();await registerUser()});
$("#recoveryForm").addEventListener("submit",updateRecoveredPassword);
$$("[data-auth-mode]").forEach(btn=>btn.addEventListener("click",()=>switchAuthMode(btn.dataset.authMode)));
$$("[data-toggle-password]").forEach(btn=>btn.addEventListener("click",()=>togglePassword(btn.dataset.togglePassword,btn)));
$("#forgotPasswordBtn").addEventListener("click",sendPasswordReset);
$("#resendConfirmationBtn")?.addEventListener("click",resendConfirmationEmail);
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
syncBrand();renderAll();restoreSession();