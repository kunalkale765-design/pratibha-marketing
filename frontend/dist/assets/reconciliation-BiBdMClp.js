import"./responsive-D1ZTW0b0.js";/* empty css             *//* empty css               *//* empty css                *//* empty css               */import{s as c}from"./ui-D1Am529b.js";import"./api-BqPqbFNt.js";const g=()=>new Promise(t=>{window.Auth?t(window.Auth):setTimeout(()=>t(g()),10)}),f=await g();let d=[],l=null,o=null,u=0;async function E(){await f.requireAuth(["admin","staff"])&&(k(),await v())}async function v(){try{const t=await fetch("/api/reconciliation/pending",{credentials:"include"});if(!t.ok)throw new Error("Failed to load pending orders");d=(await t.json()).data||[],B(),C()}catch(t){console.error("Error loading pending orders:",t),c("Failed to load orders","error")}}function B(){document.getElementById("statTotal").textContent=d.length+u,document.getElementById("statPending").textContent=d.length,document.getElementById("statCompleted").textContent=u}function C(){const t=document.getElementById("orderList");if(t){if(d.length===0){t.innerHTML=`
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders pending reconciliation</p>
            </div>
        `;return}t.innerHTML=d.map(e=>{const n=b(e.customer?.name||"U");return`
            <div class="order-card card-animated" data-order-id="${e._id}" onclick="openReconciliation('${e._id}')">
                <div class="order-avatar">${n}</div>
                <div class="order-details">
                    <div class="order-customer">${e.customer?.name||"Unknown"}</div>
                    <div class="order-meta">
                        <span class="order-number">${e.orderNumber}</span>
                        ${e.batch?`<span class="order-batch">${e.batch.batchType||"1st"}</span>`:""}
                    </div>
                    <div class="order-items">${e.itemCount} items</div>
                </div>
                <div class="order-amount">&#8377;${e.totalAmount?.toLocaleString()||0}</div>
                <div class="order-arrow">&rarr;</div>
            </div>
        `}).join("")}}function b(t){return t.split(" ").map(e=>e[0]).join("").toUpperCase().slice(0,2)}async function L(t){try{l=t,document.getElementById("reconcileModal").classList.add("active"),document.getElementById("reconcileItems").innerHTML='<div class="loading">Loading order details...</div>';const n=await fetch(`/api/reconciliation/${t}`,{credentials:"include"});if(!n.ok){const a=await n.json();throw new Error(a.message||"Failed to load order")}o=(await n.json()).data,document.getElementById("modalTitle").textContent="Reconcile Order",document.getElementById("modalSubtitle").textContent=o.orderNumber,document.getElementById("infoCustomer").textContent=o.customer?.name||"Unknown",document.getElementById("infoTotal").textContent=`₹${o.totalAmount?.toLocaleString()||0}`,T(),h()}catch(e){console.error("Error loading order:",e),c(e.message||"Failed to load order","error"),p()}}function T(){const t=document.getElementById("reconcileItems");o&&(t.innerHTML=o.products.map((e,n)=>`
        <div class="reconcile-item" id="item-${n}" data-index="${n}">
            <div class="item-info">
                <div class="item-name">${e.productName}</div>
                <div class="item-unit">${e.unit} @ ₹${e.rate}</div>
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
                    data-index="${n}"
                    onchange="onQuantityChange(${n})"
                    oninput="onQuantityInput(${n})">
            </div>
            <div class="item-reason" id="reason-row-${n}" style="display: none;">
                <input type="text"
                    class="reason-input"
                    id="reason-${n}"
                    placeholder="Reason for change (optional)"
                    maxlength="200">
            </div>
        </div>
    `).join(""))}function w(t){const e=document.getElementById(`qty-${t}`),n=document.getElementById(`item-${t}`),i=document.getElementById(`reason-row-${t}`),a=parseFloat(e.dataset.original),r=parseFloat(e.value)||0;n.classList.remove("modified","zeroed"),e.classList.remove("modified","zeroed"),r===0?(n.classList.add("zeroed"),e.classList.add("zeroed"),i.style.display="block"):r!==a?(n.classList.add("modified"),e.classList.add("modified"),i.style.display="block"):i.style.display="none",h()}function Q(t){w(t)}function h(){if(!o)return;const t=o.totalAmount;let e=0;o.products.forEach((a,r)=>{const m=document.getElementById(`qty-${r}`),s=parseFloat(m?.value)||0;e+=s*a.rate}),e=Math.round(e*100)/100;const n=Math.round((t-e)*100)/100;document.getElementById("summaryOriginal").textContent=`₹${t.toLocaleString()}`,document.getElementById("summaryAdjusted").textContent=`₹${e.toLocaleString()}`;const i=document.getElementById("summaryDifferenceRow");n!==0?(i.style.display="flex",document.getElementById("summaryDifference").textContent=`-₹${n.toLocaleString()}`):i.style.display="none"}async function R(){if(!l||!o)return;const t=document.getElementById("btnComplete");t.disabled=!0,t.textContent="Processing...";try{const e=o.products.map((s,y)=>{const I=document.getElementById(`qty-${y}`),$=document.getElementById(`reason-${y}`);return{product:s.product,deliveredQty:parseFloat(I?.value)||0,reason:$?.value||""}}),n=document.getElementById("reconcileNotes")?.value||"",i=await f.ensureCsrfToken(),a={"Content-Type":"application/json"};i&&(a["X-CSRF-Token"]=i);const r=await fetch(`/api/reconciliation/${l}/complete`,{method:"POST",headers:a,credentials:"include",body:JSON.stringify({items:e,notes:n})});if(!r.ok){const s=await r.json();throw new Error(s.message||"Failed to complete reconciliation")}const m=await r.json();c(`Order ${m.data.orderNumber} reconciled successfully`,"success"),u++,p(),await v()}catch(e){console.error("Error completing reconciliation:",e),c(e.message||"Failed to complete reconciliation","error")}finally{t.disabled=!1,t.textContent="Complete Reconciliation"}}function p(){document.getElementById("reconcileModal").classList.remove("active"),l=null,o=null;const e=document.getElementById("reconcileNotes");e&&(e.value="")}function S(){const t=document.getElementById("helpBanner");t&&(t.style.display="none",localStorage.setItem("reconciliationHelpDismissed","true"))}function k(){const t=localStorage.getItem("reconciliationHelpDismissed"),e=document.getElementById("helpBanner");e&&t==="true"&&(e.style.display="none")}window.openReconciliation=L;window.closeModal=p;window.completeReconciliation=R;window.onQuantityChange=Q;window.onQuantityInput=w;window.dismissHelp=S;E();
