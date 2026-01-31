import"./responsive-C3eqjYrO.js";/* empty css             *//* empty css                */import"./ui-DPXrEiII.js";import"./api-BVpkjr3r.js";function i(t){if(t==null)return"";const e=document.createElement("div");return e.textContent=String(t),e.innerHTML}const w=(t=1e4)=>new Promise((e,a)=>{const s=Date.now(),r=()=>{if(window.Auth)return e(window.Auth);if(Date.now()-s>t)return a(new Error("Auth not available"));setTimeout(r,50)};r()}),y=await w();let l=[],o="queue",h=null;async function $(){h=await y.requireAuth(["admin","staff"]),h&&(k(),await u(),await v())}function k(){const t=document.getElementById("queueViewBtn"),e=document.getElementById("batchViewBtn");t?.addEventListener("click",()=>g("queue")),e?.addEventListener("click",()=>g("batch"))}async function g(t){o=t,document.querySelectorAll(".view-btn").forEach(e=>{e.classList.toggle("active",e.dataset.view===t)}),document.querySelectorAll(".view-container").forEach(e=>{e.classList.toggle("active",e.id===`${t}View`)}),t==="batch"&&await L()}async function u(){try{const t=await fetch("/api/packing/queue",{credentials:"include"});if(!t.ok)throw new Error("Failed to load queue");l=(await t.json()).data||[],E()}catch(t){console.error("Error loading queue:",t),l=[];const e=document.getElementById("queueList");e&&(e.innerHTML=`
                <div class="error-state" style="text-align:center;padding:2rem;color:var(--error);">
                    <p>Failed to load packing queue</p>
                    <button onclick="window.location.reload()" style="margin-top:1rem;padding:0.5rem 1rem;background:var(--dusty-olive);color:white;border:none;border-radius:8px;cursor:pointer;">Retry</button>
                </div>
            `)}}async function v(){try{const t=await fetch("/api/packing/stats",{credentials:"include"});if(!t.ok)return;const a=(await t.json()).data;document.getElementById("statTotal").textContent=a.total||0,document.getElementById("statPending").textContent=a.notStarted||0,document.getElementById("statInProgress").textContent=a.inProgress||0,document.getElementById("statCompleted").textContent=a.completed||0}catch(t){console.error("Error loading stats:",t)}}function E(){const t=document.getElementById("queueList");if(!t)return;if(l.length===0){t.innerHTML=`
            <div class="empty-state">
                <div class="empty-icon">&#10003;</div>
                <h3>All caught up!</h3>
                <p>No orders waiting to be packed</p>
            </div>
        `;return}const e={};l.forEach(a=>{const s=a.batch?.batchNumber||"No Batch";e[s]||(e[s]={batch:a.batch,orders:[]}),e[s].orders.push(a)}),t.innerHTML=Object.entries(e).map(([a,s])=>`
        <div class="batch-group">
            <div class="batch-header">
                <span class="batch-name">${i(a)}</span>
                <span class="batch-count">${s.orders.length} orders</span>
            </div>
            <div class="batch-orders">
                ${s.orders.map(r=>B(r)).join("")}
            </div>
        </div>
    `).join(""),t.querySelectorAll(".order-card").forEach(a=>{a.addEventListener("click",()=>{const s=a.dataset.orderId;window.location.href=`/pages/orders/?order=${s}&action=pack`})})}function B(t){const e=P(t.packingStatus),a=I(t.packingStatus),s=t.packingStatus==="in_progress"?`${t.packedItems}/${t.itemCount}`:"";return`
        <div class="order-card card-animated ${e}" data-order-id="${i(t._id)}">
            <div class="order-main">
                <div class="order-info">
                    <span class="order-number">${i(t.orderNumber)}</span>
                    <span class="customer-name">${i(t.customer?.name||"Unknown")}</span>
                </div>
                <div class="order-meta">
                    <span class="item-count">${t.itemCount} items</span>
                    <span class="order-amount">&#8377;${t.totalAmount?.toLocaleString()||0}</span>
                </div>
            </div>
            <div class="order-status">
                <span class="status-badge ${e}">${a}</span>
                ${s?`<span class="progress-mini">${s}</span>`:""}
            </div>
            <div class="order-action">
                <span class="action-arrow">&rarr;</span>
            </div>
        </div>
    `}function P(t){switch(t){case"in_progress":return"status-progress";case"completed":return"status-done";case"on_hold":return"status-hold";default:return"status-pending"}}function I(t){switch(t){case"in_progress":return"In Progress";case"completed":return"Packed";case"on_hold":return"On Hold";default:return"Ready"}}async function L(){const t=document.getElementById("batchList");if(t){t.innerHTML='<div class="loading">Loading batches...</div>';try{const e=await fetch("/api/batches/today",{credentials:"include"});if(o!=="batch")return;if(!e.ok)throw new Error("Failed to load batches");const s=(await e.json()).data||[];if(s.length===0){t.innerHTML=`
                <div class="empty-state">
                    <h3>No batches today</h3>
                    <p>Batches will appear here when orders come in</p>
                </div>
            `;return}const r=await Promise.all(s.map(async n=>{try{const c=await fetch(`/api/batches/${n._id}/quantity-summary`,{credentials:"include"});if(c.ok){const m=await c.json();return m.data||m}}catch(c){console.error("Error loading batch summary:",c)}return{batch:n,orderStats:{},products:[]}}));if(o!=="batch")return;t.innerHTML=r.map(n=>S(n)).join("")}catch(e){console.error("Error loading batch view:",e),o==="batch"&&(t.innerHTML='<div class="error-state">Failed to load batches</div>')}}}function S(t){const{batch:e,orderStats:a,products:s}=t,r=a.total>0?Math.round(a.completed/a.total*100):0;return`
        <div class="batch-summary-card">
            <div class="batch-summary-header">
                <div>
                    <h3>${i(e.batchNumber)}</h3>
                    <span class="batch-type">${i(e.batchType)} Batch</span>
                </div>
                <div class="batch-progress-ring" style="--progress: ${r}">
                    <span>${r}%</span>
                </div>
            </div>

            <div class="batch-order-stats">
                <div class="stat-mini">
                    <span class="stat-value">${a.total||0}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat-mini pending">
                    <span class="stat-value">${a.notStarted||0}</span>
                    <span class="stat-label">Pending</span>
                </div>
                <div class="stat-mini progress">
                    <span class="stat-value">${a.inProgress||0}</span>
                    <span class="stat-label">Packing</span>
                </div>
                <div class="stat-mini done">
                    <span class="stat-value">${a.completed||0}</span>
                    <span class="stat-label">Done</span>
                </div>
            </div>

            ${s.length>0?`
                <div class="batch-products">
                    <h4>Products to Pack</h4>
                    <div class="product-list">
                        ${s.slice(0,5).map(n=>`
                            <div class="product-row ${n.remaining<=0?"done":""}">
                                <span class="product-name">${i(n.productName)}</span>
                                <span class="product-qty">
                                    ${n.totalPacked}/${n.totalOrdered} ${i(n.unit)}
                                </span>
                                <div class="product-progress-bar">
                                    <div class="product-progress-fill" style="width: ${n.percentPacked}%"></div>
                                </div>
                            </div>
                        `).join("")}
                        ${s.length>5?`
                            <div class="more-products">+${s.length-5} more products</div>
                        `:""}
                    </div>
                </div>
            `:""}
        </div>
    `}function b(t,e){try{if(e===void 0)return localStorage.getItem(t);localStorage.setItem(t,e)}catch{return null}}function q(){const t=document.getElementById("packingHelpBanner");t&&(t.style.display="none",b("packingHelpDismissed","true"))}function H(){const t=b("packingHelpDismissed"),e=document.getElementById("packingHelpBanner");e&&t==="true"&&(e.style.display="none")}H();let d=null;function f(){p(),d=setInterval(()=>{u()},3e4)}function p(){d&&(clearInterval(d),d=null)}document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"?(v(),u(),f()):p()});window.dismissPackingHelp=q;window.addEventListener("beforeunload",p);$().then(()=>{f()});
