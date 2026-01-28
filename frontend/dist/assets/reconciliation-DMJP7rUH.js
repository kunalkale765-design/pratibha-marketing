import"./responsive-D1ZTW0b0.js";/* empty css             *//* empty css                */import{s as g}from"./ui-CbzHyiqg.js";import"./api-CPXug1OA.js";function s(t){return t==null?"":String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}const b=(t=1e4)=>new Promise((e,n)=>{const o=Date.now(),r=()=>{if(window.Auth)return e(window.Auth);if(Date.now()-o>t)return n(new Error("Auth not available"));setTimeout(r,50)};r()}),w=await b();let c=[],l=null,i=null,m=0;async function L(){await w.requireAuth(["admin","staff"])&&(x(),await f())}async function f(){try{const t=await fetch("/api/reconciliation/pending",{credentials:"include"});if(!t.ok)throw new Error("Failed to load pending orders");if(t.status===401){window.location.href="/pages/auth/login.html";return}const e=await t.json();c=e.data||[],m=e.todayCompleted||0,C(),T()}catch(t){console.error("Error loading pending orders:",t);const e=document.getElementById("orderList");e&&(e.innerHTML=`
                <div class="error-state" style="text-align:center;padding:2rem;color:var(--error);">
                    <p>Failed to load orders</p>
                    <button onclick="window.location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:var(--dusty-olive);color:white;border:none;border-radius:8px;cursor:pointer;">Retry</button>
                </div>
            `)}}function C(){document.getElementById("statTotal").textContent=c.length+m,document.getElementById("statPending").textContent=c.length,document.getElementById("statCompleted").textContent=m}function T(){const t=document.getElementById("orderList");if(t){if(c.length===0){t.innerHTML=`
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders pending reconciliation</p>
            </div>
        `;return}t.innerHTML=c.map(e=>{const n=s(S(e.customer?.name||"U")),o=s(e.customer?.name||"Unknown"),r=s(e.orderNumber),a=s(e.batch?.batchType||"1st");return`
            <div class="order-card card-animated" data-order-id="${s(e._id)}">
                <div class="order-avatar">${n}</div>
                <div class="order-details">
                    <div class="order-customer">${o}</div>
                    <div class="order-meta">
                        <span class="order-number">${r}</span>
                        ${e.batch?`<span class="order-batch">${a}</span>`:""}
                    </div>
                    <div class="order-items">${e.itemCount} items</div>
                </div>
                <div class="order-amount">&#8377;${e.totalAmount?.toLocaleString()||0}</div>
                <div class="order-arrow">&rarr;</div>
            </div>
        `}).join(""),t.querySelectorAll(".order-card").forEach(e=>{e.addEventListener("click",()=>{const n=e.dataset.orderId;n&&h(n)})})}}function S(t){return t.split(" ").map(e=>e[0]).join("").toUpperCase().slice(0,2)}async function h(t){try{l=t,document.getElementById("reconcileModal").classList.add("active"),document.getElementById("reconcileItems").innerHTML='<div class="loading">Loading order details...</div>';const n=await fetch(`/api/reconciliation/${t}`,{credentials:"include"});if(!n.ok){const r=await n.json();throw new Error(r.message||"Failed to load order")}i=(await n.json()).data,document.getElementById("modalTitle").textContent="Reconcile Order",document.getElementById("modalSubtitle").textContent=i.orderNumber,document.getElementById("infoCustomer").textContent=i.customer?.name||"Unknown",document.getElementById("infoTotal").textContent=`₹${i.totalAmount?.toLocaleString()||0}`,k(),I()}catch(e){console.error("Error loading order:",e),g(e.message||"Failed to load order","error"),u()}}function k(){const t=document.getElementById("reconcileItems");i&&(t.innerHTML=i.products.map((e,n)=>{const o=s(e.productName),r=s(e.unit);return`
        <div class="reconcile-item" id="item-${n}" data-index="${n}">
            <div class="item-info">
                <div class="item-name">${o}</div>
                <div class="item-unit">${r} @ ₹${e.rate}</div>
            </div>
            <div class="item-ordered">${e.orderedQty}</div>
            <div class="item-delivered">
                <input type="number"
                    class="qty-input"
                    id="qty-${n}"
                    value="${e.deliveredQty}"
                    min="0"
                    step="0.1"
                    data-original="${e.orderedQty}"
                    data-index="${n}">
            </div>
            <div class="item-reason" id="reason-row-${n}" style="display: none;">
                <input type="text"
                    class="reason-input"
                    id="reason-${n}"
                    placeholder="Reason for change (optional)"
                    maxlength="200">
            </div>
        </div>
    `}).join(""),t.querySelectorAll(".qty-input").forEach(e=>{e.addEventListener("change",()=>E(parseInt(e.dataset.index))),e.addEventListener("input",()=>v(parseInt(e.dataset.index)))}))}function v(t){const e=document.getElementById(`qty-${t}`),n=document.getElementById(`item-${t}`),o=document.getElementById(`reason-row-${t}`),r=parseFloat(e.dataset.original),a=parseFloat(e.value)||0;n.classList.remove("modified","zeroed"),e.classList.remove("modified","zeroed"),a===0?(n.classList.add("zeroed"),e.classList.add("zeroed"),o.style.display="block"):a!==r?(n.classList.add("modified"),e.classList.add("modified"),o.style.display="block"):o.style.display="none",I()}function E(t){v(t)}function I(){if(!i)return;const t=i.totalAmount;let e=0;i.products.forEach((r,a)=>{const d=document.getElementById(`qty-${a}`),p=parseFloat(d?.value)||0;e+=p*r.rate}),e=Math.round(e*100)/100;const n=Math.round((t-e)*100)/100;document.getElementById("summaryOriginal").textContent=`₹${t.toLocaleString()}`,document.getElementById("summaryAdjusted").textContent=`₹${e.toLocaleString()}`;const o=document.getElementById("summaryDifferenceRow");n!==0?(o.style.display="flex",document.getElementById("summaryDifference").textContent=`-₹${n.toLocaleString()}`):o.style.display="none"}async function A(){if(!l||!i)return;const t=i.products.map((o,r)=>{const a=document.getElementById(`qty-${r}`),d=document.getElementById(`reason-${r}`);return{product:o.product,deliveredQty:parseFloat(a?.value)||0,reason:d?.value||""}});if(t.every(o=>o.deliveredQty===0)&&!confirm("All quantities are zero. Are you sure?")||!confirm("Mark this order as delivered?"))return;const n=document.getElementById("btnComplete");n.disabled=!0,n.textContent="Processing...";try{const o=document.getElementById("reconcileNotes")?.value||"",r=await w.ensureCsrfToken(),a={"Content-Type":"application/json"};r&&(a["X-CSRF-Token"]=r);const d=await fetch(`/api/reconciliation/${l}/complete`,{method:"POST",headers:a,credentials:"include",body:JSON.stringify({items:t,notes:o})});if(!d.ok){const B=await d.json();throw new Error(B.message||"Failed to complete reconciliation")}const p=await d.json();g(`Order ${p.data.orderNumber} reconciled successfully`,"success"),m++,u(),await f()}catch(o){console.error("Error completing reconciliation:",o),g(o.message||"Failed to complete reconciliation","error")}finally{n.disabled=!1,n.textContent="Complete Reconciliation"}}function u(){document.getElementById("reconcileModal").classList.remove("active"),l=null,i=null;const e=document.getElementById("reconcileNotes");e&&(e.value="")}const y=document.getElementById("reconcileModal");y&&y.addEventListener("click",t=>{(t.target===y||t.target.classList.contains("modal-overlay"))&&u()});function $(t,e){try{if(e===void 0)return localStorage.getItem(t);localStorage.setItem(t,e)}catch{return null}}function M(){const t=document.getElementById("helpBanner");t&&(t.style.display="none",$("reconciliationHelpDismissed","true"))}function x(){const t=$("reconciliationHelpDismissed"),e=document.getElementById("helpBanner");e&&t==="true"&&(e.style.display="none")}document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&f()});window.openReconciliation=h;window.closeModal=u;window.completeReconciliation=A;window.onQuantityChange=E;window.onQuantityInput=v;window.dismissHelp=M;L();
