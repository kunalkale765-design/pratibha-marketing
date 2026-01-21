import"./responsive-D1ZTW0b0.js";/* empty css             *//* empty css                */import{c as o,s as C}from"./ui-D1Am529b.js";import"./api-BqPqbFNt.js";import{i as z,l as Z}from"./init-6NQZls6S.js";function N(t,a=!0){if(t==null||isNaN(t))return a?"₹0":"0";const i=Number(t).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:2});return a?`₹${i}`:i}const M=()=>new Promise(t=>{window.Auth?t(window.Auth):setTimeout(()=>t(M()),10)}),x=await M();z();let v=[],B=[],L=[],A=[],E="all";const I={},j=document.getElementById("logoutBtn"),F=document.getElementById("printBtn"),q=document.getElementById("exportBtn"),y=document.getElementById("saveRatesBtn");j&&j.addEventListener("click",Z);F&&F.addEventListener("click",X);q&&q.addEventListener("click",J);y&&y.addEventListener("click",K);document.querySelectorAll(".batch-filter-btn").forEach(t=>{t.addEventListener("click",()=>{document.querySelectorAll(".batch-filter-btn").forEach(a=>a.classList.remove("active")),t.classList.add("active"),E=t.dataset.batch,$()})});async function O(){try{const[t,a,i,l,c,m]=await Promise.all([fetch("/api/orders",{credentials:"include"}),fetch("/api/customers",{credentials:"include"}),fetch("/api/products",{credentials:"include"}),fetch("/api/market-rates",{credentials:"include"}),fetch("/api/supplier/quantity-summary",{credentials:"include"}),fetch("/api/supplier/batch-summary",{credentials:"include"})]),r=await t.json(),p=await a.json(),s=await i.json(),e=await l.json(),d=await c.json(),g=await m.json();v=s.data||[],B=e.data||[],L=d.data||[],A=g.data||[];const n=r.data||[],u=n.filter(b=>b.status==="delivered"||b.paymentStatus==="paid").reduce((b,k)=>b+(k.totalAmount||0),0),D=u*.15;document.getElementById("totalSale").textContent=N(u),document.getElementById("totalProfit").textContent=N(D),$(),Y(n)}catch(t){console.error("Error loading dashboard stats:",t),document.getElementById("totalSale").textContent="—",document.getElementById("totalProfit").textContent="—",document.getElementById("procurementList").innerHTML="",document.getElementById("procurementList").appendChild(o("div",{className:"empty-state"},[o("p",{},"Data not available"),o("button",{id:"retryBtn",className:"btn-retry",style:{marginTop:"1rem",padding:"0.5rem 1rem",background:"var(--dusty-olive)",color:"white",border:"none",borderRadius:"8px",cursor:"pointer"},onclick:O},"Try Again")]))}}function $(){const t=document.getElementById("procurementList");if(t.innerHTML="",!v||v.length===0){t.appendChild(o("div",{className:"empty-state"},"No products available"));return}const a={};B.forEach(e=>{a[e.product]=e});let i=L;if(E!=="all"){const e=A.find(d=>d.batchType===E);e&&e.products?i=e.products.map(d=>({productName:d.productName,totalQuantity:d.totalQuantity,unit:d.unit,orderCount:d.orderCount})):i=[]}const l={};i.forEach(e=>{l[e.productName]=e});const m=[...v.filter(e=>e.category==="Indian Vegetables"||e.category==="Fruits")].sort((e,d)=>{if(e.category==="Indian Vegetables"&&d.category==="Fruits")return-1;if(e.category==="Fruits"&&d.category==="Indian Vegetables")return 1;const g=a[e._id]?.rate||0,n=a[d._id]?.rate||0;if(g===0&&n!==0)return-1;if(g!==0&&n===0)return 1;const u=l[e.name]?.totalQuantity||0;return(l[d.name]?.totalQuantity||0)-u}),r=document.createDocumentFragment(),p=o("div",{className:"procurement-column-header"},[o("span",{className:"col-expand"}),o("span",{className:"col-name"},"Product"),o("span",{className:"col-qty"},"Purchase Qty"),o("span",{className:"col-input"},"Purchase Price")]);r.appendChild(p);let s="";m.forEach(e=>{const d=a[e._id],g=d?d.rate:0,n=d?d.trend:"stable",u=l[e.name],f=u?u.totalQuantity:0,D=u?u.orderCount:0,b=f>0?f*g:0,k=f>0?"item-qty":"item-qty zero",U=n==="up"?"↑ Up":n==="down"?"↓ Down":"— Stable",H=g===0?" unsaved":"";e.category!==s&&(s=e.category,r.appendChild(o("div",{className:"category-divider"},s)));const V=o("div",{className:`procurement-item${H}`,dataset:{productId:e._id}},[o("div",{className:"item-main",onclick:w=>window.toggleExpand(w.currentTarget)},[o("span",{className:"item-expand"},"▶"),o("span",{className:"item-name"},e.name),o("span",{className:k},f),o("span",{className:"item-unit"},e.unit),o("input",{type:"number",className:"item-rate-input",dataset:{productId:e._id,productName:e.name,currentRate:g},placeholder:`₹${g.toFixed(0)}`,step:"0.01",min:"0",onclick:w=>w.stopPropagation(),onchange:w=>window.handleRateChange(w.target),oninput:w=>window.handleRateInput(w.target)})]),o("div",{className:"item-details"},[o("div",{className:"detail-row"},[o("span",{className:"detail-label"},"Current Rate"),o("span",{className:"detail-value"},`₹${g.toFixed(2)}/${e.unit}`)]),o("div",{className:"detail-row"},[o("span",{className:"detail-label"},"Orders"),o("span",{className:"detail-value"},D)]),o("div",{className:"detail-row"},[o("span",{className:"detail-label"},"Est. Cost"),o("span",{className:"detail-value highlight"},b>0?N(b):"-")]),o("div",{className:"detail-row"},[o("span",{className:"detail-label"},"Trend"),o("span",{className:"detail-value"},U)])])]);r.appendChild(V)}),t.appendChild(r)}window.toggleExpand=function(t){t.closest(".procurement-item").classList.toggle("expanded")};window.handleRateInput=function(t){const a=parseFloat(t.dataset.currentRate),i=parseFloat(t.value);t.classList.toggle("changed",t.value&&i!==a)};window.handleRateChange=function(t){const a=t.dataset.productId,i=t.dataset.productName,l=parseFloat(t.dataset.currentRate),c=parseFloat(t.value);t.value&&c!==l&&c>0?(I[a]={product:a,productName:i,rate:c,previousRate:l},t.classList.add("changed")):(delete I[a],t.classList.remove("changed")),y&&y.classList.toggle("show",Object.keys(I).length>0)};function X(){const t={};B.forEach(s=>{t[s.product]=s});let a=L;if(E!=="all"){const s=A.find(e=>e.batchType===E);s&&s.products?a=s.products.map(e=>({productName:e.productName,totalQuantity:e.totalQuantity,unit:e.unit,orderCount:e.orderCount})):a=[]}const i={};a.forEach(s=>{i[s.productName]=s});const c=[...v.filter(s=>s.category==="Indian Vegetables"||s.category==="Fruits")].sort((s,e)=>{if(s.category==="Indian Vegetables"&&e.category==="Fruits")return-1;if(s.category==="Fruits"&&e.category==="Indian Vegetables")return 1;const d=i[s.name]?.totalQuantity||0;return(i[e.name]?.totalQuantity||0)-d});let m="",r="";c.forEach(s=>{const e=t[s._id],d=e?e.rate:0,g=i[s.name],n=g?g.totalQuantity:0;s.category!==r&&(r=s.category,m+=`
                <tr class="category-row">
                    <td colspan="4" class="category-header">${r}</td>
                </tr>
            `),m+=`
            <tr>
                <td class="product-name">${s.name}</td>
                <td class="qty">${n}</td>
                <td class="unit">${s.unit}</td>
                <td class="price">${d>0?"₹"+d.toFixed(0):""}</td>
            </tr>
        `});const p=window.open("","_blank");p.document.write(`
        <html>
        <head>
            <title>Purchase List - Pratibha Marketing</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    font-size: 14px;
                }
                h1 {
                    font-size: 18px;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                .date {
                    color: #666;
                    margin-bottom: 15px;
                    font-size: 13px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                th {
                    background: #f5f5f5;
                    padding: 8px 10px;
                    text-align: left;
                    border-bottom: 2px solid #333;
                    font-weight: bold;
                }
                th.qty, th.price {
                    text-align: right;
                    width: 100px;
                }
                th.unit {
                    text-align: center;
                    width: 60px;
                }
                td {
                    padding: 6px 10px;
                    border-bottom: 1px solid #ddd;
                }
                td.product-name {
                    font-weight: 500;
                }
                td.qty {
                    text-align: right;
                    font-family: 'Courier New', monospace;
                    font-weight: bold;
                }
                td.unit {
                    text-align: center;
                    color: #666;
                    font-size: 12px;
                }
                td.price {
                    text-align: right;
                    font-family: 'Courier New', monospace;
                    color: #666;
                }
                .category-row td {
                    padding: 0;
                    border: none;
                }
                .category-header {
                    background: #e8e8e8;
                    padding: 8px 10px !important;
                    font-weight: bold;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #555;
                    border-bottom: 1px solid #ccc !important;
                    margin-top: 10px;
                }
                @media print {
                    body { padding: 10px; }
                    .category-row { break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <h1>Purchase List - Pratibha Marketing</h1>
            <div class="date">${new Date().toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
            <table>
                <thead>
                    <tr>
                        <th>Product</th>
                        <th class="qty">Purchase Qty</th>
                        <th class="unit">Unit</th>
                        <th class="price">Purchase Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${m}
                </tbody>
            </table>
        </body>
        </html>
    `),p.document.close(),p.print()}function J(){const t={};B.forEach(e=>{const d=typeof e.product=="object"?e.product._id:e.product;t[d]=e});const a={};L.forEach(e=>{a[e.productName]=e});const i=v.filter(e=>e.category==="Indian Vegetables"||e.category==="Fruits").sort((e,d)=>{if(e.category==="Indian Vegetables"&&d.category==="Fruits")return-1;if(e.category==="Fruits"&&d.category==="Indian Vegetables")return 1;const g=t[e._id]?.rate||0,n=t[d._id]?.rate||0;if(g===0&&n!==0)return-1;if(g!==0&&n===0)return 1;const u=a[e.name]?.totalQuantity||0;return(a[d.name]?.totalQuantity||0)-u}),l=["Category","Product","Unit","Qty Needed","Current Rate","Est. Cost"],c=i.map(e=>{const g=a[e.name]?.totalQuantity||0,n=t[e._id],u=n?n.rate:0,f=g*u;return[`"${e.category}"`,`"${e.name}"`,e.unit,g,u,f.toFixed(2)].join(",")}),m=[l.join(","),...c].join(`
`),r=new Blob([m],{type:"text/csv"}),p=window.URL.createObjectURL(r),s=document.createElement("a");s.href=p,s.download=`purchase-list-${new Date().toISOString().split("T")[0]}.csv`,s.click(),window.URL.revokeObjectURL(p)}async function K(){if(!y)return;y.textContent="Saving...",y.disabled=!0;const t=[],a=[],i={"Content-Type":"application/json"};let l=await x.ensureCsrfToken();l&&(i["X-CSRF-Token"]=l);for(const[c,m]of Object.entries(I))try{let r=await fetch("/api/market-rates",{method:"POST",headers:i,credentials:"include",body:JSON.stringify({product:m.product,rate:m.rate,effectiveDate:new Date().toISOString()})});if(r.status===403){const p=await r.json().catch(()=>({}));if(p.message?.toLowerCase().includes("csrf"))l=await x.refreshCsrfToken(),l&&(i["X-CSRF-Token"]=l,r=await fetch("/api/market-rates",{method:"POST",headers:i,credentials:"include",body:JSON.stringify({product:m.product,rate:m.rate,effectiveDate:new Date().toISOString()})}));else{t.push({productName:m.productName||c,error:p.message||`HTTP ${r.status}`});continue}}if(r.ok)a.push(c);else{const p=await r.json().catch(()=>({}));t.push({productName:m.productName||c,error:p.message||`HTTP ${r.status}`})}}catch(r){console.error("Error saving rate:",r),t.push({productName:m.productName||c,error:r.message||"Network error"})}for(const c of a)delete I[c];y.textContent="Save",y.disabled=!1,t.length>0?(t.map(c=>c.productName).join(", "),C(`${t.length} rate(s) not saved. Try again.`,"info"),Object.keys(I).length>0?y.classList.add("show"):y.classList.remove("show")):(y.classList.remove("show"),document.querySelectorAll(".item-rate-input").forEach(c=>{c.value="",c.classList.remove("changed")})),O()}async function W(){try{(await(await fetch("/api/health")).json()).status==="ok"?(document.getElementById("apiDot").classList.remove("offline"),document.getElementById("apiStatus").textContent="API Online"):(document.getElementById("apiDot").classList.add("offline"),document.getElementById("apiStatus").textContent="API Offline")}catch{document.getElementById("apiDot").classList.add("offline"),document.getElementById("apiStatus").textContent="API Offline"}}let T=null,S=null,R=null;const h={olive:"rgb(126, 145, 129)",oliveLight:"rgba(126, 145, 129, 0.2)",gunmetal:"rgb(46, 53, 50)",terracotta:"rgb(196, 167, 125)",success:"rgb(93, 122, 95)",warning:"rgb(184, 154, 90)",error:"rgb(154, 101, 101)",slate:"rgb(199, 206, 219)"};async function Y(t){try{const a={pending:0,confirmed:0,delivered:0,cancelled:0};t.forEach(n=>{Object.hasOwn(a,n.status)&&a[n.status]++}),document.getElementById("pendingCount").textContent=a.pending,document.getElementById("processingCount").textContent=a.confirmed,document.getElementById("deliveredCount").textContent=a.delivered;const i=document.getElementById("orderStatusChart");T&&T.destroy(),T=new Chart(i,{type:"doughnut",data:{labels:["Pending","Confirmed","Delivered","Cancelled"],datasets:[{data:[a.pending,a.confirmed,a.delivered,a.cancelled],backgroundColor:[h.warning,h.olive,h.success,h.error],borderWidth:0}]},options:{responsive:!0,maintainAspectRatio:!1,cutout:"60%",plugins:{legend:{display:!1}}}});const l=[],c={};for(let n=6;n>=0;n--){const u=new Date;u.setDate(u.getDate()-n);const f=u.toISOString().split("T")[0];l.push(f),c[f]=0}t.forEach(n=>{if(n.status!=="cancelled"){const u=new Date(n.createdAt).toISOString().split("T")[0];Object.hasOwn(c,u)&&(c[u]+=n.totalAmount||0)}});const m=l.map(n=>c[n]),r=m.reduce((n,u)=>n+u,0),p=r/7;document.getElementById("weekTotal").textContent=N(r),document.getElementById("avgDaily").textContent=N(Math.round(p));const s=document.getElementById("revenueChart");S&&S.destroy(),S=new Chart(s,{type:"line",data:{labels:l.map(n=>new Date(n).toLocaleDateString("en-IN",{weekday:"short"})),datasets:[{label:"Revenue",data:m,borderColor:h.olive,backgroundColor:h.oliveLight,fill:!0,tension:.4,pointRadius:4,pointBackgroundColor:h.olive}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{y:{beginAtZero:!0,ticks:{callback:n=>"₹"+n.toLocaleString("en-IN")}}}}});const e={};t.forEach(n=>{n.status!=="cancelled"&&n.products&&n.products.forEach(u=>{const f=u.productName||"Unknown";e[f]=(e[f]||0)+(u.quantity||0)})});const d=Object.entries(e).sort((n,u)=>u[1]-n[1]).slice(0,5),g=document.getElementById("topProductsChart");R&&R.destroy(),R=new Chart(g,{type:"bar",data:{labels:d.map(([n])=>n.length>12?n.slice(0,12)+"...":n),datasets:[{label:"Quantity",data:d.map(([,n])=>n),backgroundColor:[h.olive,h.terracotta,h.gunmetal,h.success,h.warning],borderRadius:4}]},options:{responsive:!0,maintainAspectRatio:!1,indexAxis:"y",plugins:{legend:{display:!1}},scales:{x:{beginAtZero:!0}}}})}catch(a){console.error("Error loading analytics:",a)}}let P=[];async function G(){try{const t=await fetch("/api/customers",{credentials:"include"}),a=await t.json();if(t.ok){P=a.data||[];const i=document.getElementById("ledgerCustomer");i.innerHTML="",i.appendChild(o("option",{value:""},"All Customers")),P.forEach(l=>{i.appendChild(o("option",{value:l._id},l.name))})}}catch(t){console.error("Error loading customers:",t)}}window.openLedgerModal=function(){P.length===0&&G();const t=new Date,a=new Date(t.getFullYear(),t.getMonth(),1);document.getElementById("ledgerFromDate").value=a.toISOString().split("T")[0],document.getElementById("ledgerToDate").value=t.toISOString().split("T")[0],document.getElementById("ledgerModal").classList.add("show"),document.body.style.overflow="hidden"};window.closeLedgerModal=function(){document.getElementById("ledgerModal").classList.remove("show"),document.body.style.overflow=""};window.downloadLedger=async function(){const t=document.getElementById("ledgerCustomer").value,a=document.getElementById("ledgerFromDate").value,i=document.getElementById("ledgerToDate").value,l=new URLSearchParams;t&&l.append("customerId",t),a&&l.append("fromDate",a),i&&l.append("toDate",i);try{C("Downloading ledger...","info");const c=await fetch(`/api/reports/ledger?${l}`,{credentials:"include"});if(!c.ok){const d=await c.json();throw new Error(d.message||"Ledger temporarily unavailable")}const m=await c.blob(),r=window.URL.createObjectURL(m),p=c.headers.get("Content-Disposition");let s="ledger.xlsx";p&&p.includes("filename=")&&(s=p.split("filename=")[1].replace(/"/g,""));const e=document.createElement("a");e.href=r,e.download=s,document.body.appendChild(e),e.click(),document.body.removeChild(e),window.URL.revokeObjectURL(r),C("Ledger downloaded!","success"),window.closeLedgerModal()}catch(c){console.error("Download ledger error:",c),C(c.message||"Could not download","info")}};async function Q(){try{const t=await fetch("/api/batches/today",{credentials:"include"}),a=await t.json();if(!t.ok){const r=document.getElementById("batchCards");r.innerHTML="",r.appendChild(o("div",{className:"empty-state"},"Could not load batches"));return}const i=document.getElementById("batchInfo");i.innerHTML="",i.appendChild(o("span",{className:"badge badge-info"},`Currently accepting: ${a.currentBatch}`));const l=new Date(a.currentTime);document.getElementById("batchCurrentTime").textContent=l.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"})+" IST";const c=a.data||[];if(c.length===0){const r=document.getElementById("batchCards");r.innerHTML="",r.appendChild(o("div",{className:"empty-state"},"No batches for today yet"));return}document.getElementById("batchCards").innerHTML="";const m=document.createDocumentFragment();c.forEach(r=>{const p=r.status==="open",s=r.status==="confirmed",e=s?"confirmed":p?"open":"expired",d=s?"🔒 Confirmed":p?"📝 Open":"⏰ Expired",g=r.batchType==="2nd"&&p,n=[o("div",{className:"batch-stat"},[o("span",{className:"batch-stat-value"},r.totalOrders||0),o("span",{className:"batch-stat-label"},"Orders")])];if(s&&r.confirmedAt){const f=[`Confirmed at ${new Date(r.confirmedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"})}`];r.confirmedBy?.name&&f.push(` by ${r.confirmedBy.name}`),n.push(o("div",{className:"batch-confirmed-info"},f))}const u=[o("div",{className:"batch-card-header"},[o("span",{className:"batch-type"},`${r.batchType} Batch`),o("span",{className:"batch-status"},d)]),o("div",{className:"batch-card-body"},n)];g&&u.push(o("div",{className:"batch-card-actions"},[o("button",{className:"btn-confirm-batch",onclick:()=>_(r._id)},"Confirm Batch")])),m.appendChild(o("div",{className:`batch-card ${e}`},u))}),document.getElementById("batchCards").appendChild(m)}catch(t){console.error("Error loading batches:",t);const a=document.getElementById("batchCards");a.innerHTML="",a.appendChild(o("div",{className:"empty-state"},"Could not load batches"))}}async function _(t){if(confirm("Are you sure you want to confirm this batch? Orders will be locked and customers will not be able to edit them."))try{const a=await x.ensureCsrfToken(),i={"Content-Type":"application/json"};a&&(i["X-CSRF-Token"]=a);const l=await fetch(`/api/batches/${t}/confirm`,{method:"POST",credentials:"include",headers:i}),c=await l.json();if(!l.ok){C(c.message||"Could not confirm batch","error");return}C(c.message||"Batch confirmed successfully","success"),Q()}catch(a){console.error("Error confirming batch:",a),C("Could not confirm batch","error")}}window.confirmBatch=_;async function tt(){const t=await x.requireAuth(["admin","staff"]);t&&(document.getElementById("userBadge").textContent=t.name||t.email||"User",O(),Q(),W())}tt();
