import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Role, RoundRecord } from "shared";
import { settlementSteps, settlementTiming } from "./roundPlayback";

const upstream: Record<Role, string> = {
  Retailer: "Wholesaler", Wholesaler: "Distributor", Distributor: "Factory", Factory: "Production Line"
};
const downstream: Record<Role, string> = {
  Retailer: "Consumers", Wholesaler: "Retailer", Distributor: "Wholesaler", Factory: "Distributor"
};

function Warehouse({ role, inventory }: { role: Role; inventory: number }) {
  return (
    <div className="warehouse" data-site="warehouse" aria-label={`${role} warehouse: ${inventory} units`}>
      <svg viewBox="0 0 240 160" aria-hidden="true">
        <path d="M14 57 120 12l106 45v87H14Z" fill="#132d42" stroke="#58a6ff" strokeWidth="3" />
        <path d="M4 61 120 10l116 51" fill="none" stroke="#8dc4ff" strokeWidth="5" />
        <path d="M65 144V70h110v74" fill="#091723" stroke="#4380ad" strokeWidth="2" />
        <path d="M75 84h90M75 96h90M75 108h90" stroke="#234559" strokeWidth="2" />
        <rect x="22" y="83" width="27" height="25" rx="3" fill="#43d9ad" opacity=".6" />
        <rect x="191" y="83" width="27" height="25" rx="3" fill="#43d9ad" opacity=".6" />
      </svg>
      <b className="warehouse-role">{role}</b>
      <strong className="warehouse-stock">{inventory}</strong>
      <span>UNITS IN STOCK</span>
    </div>
  );
}

function PartnerSite({ name, direction }: { name: string; direction: "upstream" | "downstream" }) {
  return (
    <div className={`settlement-partner ${direction}`} data-site={direction}>
      <span>{direction.toUpperCase()}</span>
      <svg className="partner-building" viewBox="0 0 140 110" aria-hidden="true">
        {name === "Consumers" ? (
          <g fill="#18364b" stroke="currentColor" strokeWidth="3">
            <circle cx="70" cy="28" r="15" />
            <circle cx="30" cy="40" r="12" />
            <circle cx="110" cy="40" r="12" />
            <path d="M49 96V71a21 21 0 0 1 42 0v25Z" />
            <path d="M12 96V75a18 18 0 0 1 36 0v21M92 96V75a18 18 0 0 1 36 0v21" />
          </g>
        ) : name === "Factory" || name === "Production Line" ? (
          <g fill="#18364b" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
            <path d="M16 97V23h17v38l30-20v20l30-20v20h31v36Z" />
            <path d="M20 13c-7-5 7-6 0-11M38 17c-7-5 7-6 0-11" fill="none" />
            <path d="M43 75h12v12H43Zm27 0h12v12H70Zm27 0h12v12H97Z" />
          </g>
        ) : name === "Retailer" ? (
          <g fill="#18364b" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
            <path d="M19 46h102v51H19Z" />
            <path d="m13 46 12-25h90l12 25Z" fill="#2b5869" />
            <path d="M37 46V25m22 21V25m22 21V25m22 21V25M33 97V64h28v33m16-33h29v22H77Z" />
          </g>
        ) : (
          <g fill="#18364b" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
            <path d="m10 40 60-29 60 29v57H10Z" />
            <path d="M42 97V49h56v48M52 62h36M52 73h36M52 84h36" />
            <path d="M17 65h16v17H17Zm90 0h16v17h-16Z" fill="#2b5869" />
          </g>
        )}
        <path d="M4 101h132" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <b>{name}</b>
    </div>
  );
}

function Truck({ quantity, inbound }: { quantity: number; inbound: boolean }) {
  return (
    <div className={`settlement-truck ${inbound ? "inbound" : "outbound"}`}>
      <b>{quantity} units</b>
      <svg viewBox="0 0 140 78" aria-hidden="true">
        <rect x="5" y="8" width="82" height="49" rx="5" fill={inbound ? "#43d9ad" : "#58a6ff"} />
        <path d="M88 26h25l19 22v15H88Z" fill="#e6edf3" />
        <path d="M96 31h13l12 16H96Z" fill="#183b55" />
        <path d="M4 62h130" stroke="#8fa2b5" strokeWidth="6" />
        <circle cx="28" cy="64" r="10" fill="#0a141f" stroke="#8fa2b5" strokeWidth="4" />
        <circle cx="109" cy="64" r="10" fill="#0a141f" stroke="#8fa2b5" strokeWidth="4" />
      </svg>
    </div>
  );
}

export function SettlementPanel({ role, inventory, record, onReplay }: {
  role: Role; inventory: number; record?: RoundRecord; onReplay: () => void;
}) {
  return (
    <section className="card settlement-panel" aria-labelledby="settlement-panel-title">
      <div className="settlement-panel-heading">
        <div>
          <h3 className="eyebrow" id="settlement-panel-title">LAST ROUND ACTION</h3>
          <p>{record ? `Round ${record.round}` : "No completed rounds yet. Settlement plays automatically after all four players submit."}</p>
        </div>
        <button className="secondary" disabled={!record} onClick={onReplay}>Replay</button>
      </div>
      {record ? (
        <div className="settlement-summary">
          <div><span>{role === "Factory" ? "Production ordered" : "Order placed"}</span><b>{record.orderSubmitted}</b></div>
          <div><span>Opening inventory</span><b>{record.openingInventory}</b></div>
          <div><span>Shipped to {downstream[role]}</span><b className="shipment-out">-{record.shipped}</b></div>
          <div><span>{role === "Factory" ? "Production received" : "Goods received"}</span><b className="shipment-in">+{record.shipmentReceived}</b></div>
          <div><span>Ending inventory</span><b>{record.inventory}</b></div>
        </div>
      ) : <div className="settlement-idle"><Warehouse role={role} inventory={inventory} /><p>Opening stock, deliveries and shipments will be shown here.</p></div>}
    </section>
  );
}

export function SettlementAnimation({ record, onFinish }: { record: RoundRecord; onFinish: () => void }) {
  const steps = useMemo(() => settlementSteps(record), [record]);
  const [index, setIndex] = useState(0);
  const [transferredIndex, setTransferredIndex] = useState(-1);
  const skip = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const receiving = step.kind === "receive-before" || step.kind === "receive-after";
  const moving = receiving || step.kind === "ship";
  const travelling = moving && step.quantity > 0;
  const timing = settlementTiming(step);
  const from = receiving ? upstream[record.role] : record.role;
  const to = receiving ? record.role : downstream[record.role];
  const transferred = transferredIndex === index;
  const stock = transferred ? step.after : step.before;

  useEffect(() => {
    const root = document.getElementById("root");
    const previousFocus = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    root?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    skip.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish();
      if (event.key === "Tab") { event.preventDefault(); skip.current?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root?.removeAttribute("inert");
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onFinish]);

  useEffect(() => {
    const transfer = window.setTimeout(() => setTransferredIndex(index), timing.transferAtMs);
    const next = window.setTimeout(() => {
      if (index === steps.length - 1) onFinish();
      else setIndex(current => current + 1);
    }, timing.durationMs);
    return () => { window.clearTimeout(transfer); window.clearTimeout(next); };
  }, [index, steps, onFinish, timing.durationMs, timing.transferAtMs]);

  const title = step.kind === "opening" ? "Opening inventory"
    : step.kind === "closing" ? "Round settled"
    : receiving ? (record.role === "Factory" ? "Production received" : "Goods received") : "Goods shipped";
  const detail = step.kind === "opening" ? `Stock at the start of Round ${record.round}.`
    : step.kind === "closing" ? "The dashboard will now update."
    : step.quantity === 0 ? (receiving ? "No goods received this round." : "No goods shipped this round.")
    : `${step.quantity} units from ${from} to ${to}.`;

  return createPortal(
    <div className="settlement-backdrop">
      <section className="settlement-focus" role="dialog" aria-modal="true"
        aria-labelledby="settlement-title" aria-describedby="settlement-description">
        <div className="settlement-modal-heading">
          <span className="eyebrow">ROUND {record.round} SETTLEMENT</span>
          <span className="settlement-step-count">{index + 1} / {steps.length}</span>
        </div>
        <div className="settlement-caption" aria-live="polite" aria-atomic="true">
          <h2 id="settlement-title">{title}</h2>
          <p id="settlement-description">{detail}</p>
        </div>
        <div className={`settlement-route ${receiving ? "shipment-in" : "shipment-out"}`} aria-live="polite">
          {moving ? <>
            <span>{from}</span><span className="route-arrow" aria-hidden="true">&rarr;</span><span>{to}</span>
            <b>{step.quantity} units</b>
          </> : <span>{step.kind === "opening" ? "Your warehouse before this round's movements" : "All warehouse movements completed"}</span>}
        </div>
        <div className="settlement-scene" data-phase={step.kind} data-quantity={step.quantity}
          style={{ "--travel-duration": `${timing.durationMs}ms` } as React.CSSProperties}>
          <PartnerSite name={upstream[record.role]} direction="upstream" />
          <Warehouse role={record.role} inventory={stock} />
          <PartnerSite name={downstream[record.role]} direction="downstream" />
          <div className={`settlement-road ${travelling ? receiving ? "receiving" : "shipping" : ""}`}>
            <i className="road-leg upstream-leg" /><i className="road-leg downstream-leg" />
            <i className="dock upstream-dock" /><i className="dock warehouse-dock" /><i className="dock downstream-dock" />
          </div>
          {travelling && <Truck key={index} inbound={receiving} quantity={step.quantity} />}
          {travelling && transferred && <strong className={`stock-change ${receiving ? "shipment-in" : "shipment-out"}`}>
            {receiving ? "+" : "-"}{step.quantity}
          </strong>}
        </div>
        <div className="settlement-progress" aria-hidden="true">
          {steps.map((item, i) => <i key={item.kind} className={i <= index ? "filled" : ""} />)}
        </div>
        <div className="settlement-ledger">
          <span>Orders received <b>{record.demandReceived}</b></span>
          <span>Ending backlog <b className={record.backlog > 0 ? "error" : "shipment-in"}>{record.backlog}</b></span>
          <span>Ending cash <b>{record.cash.toFixed(2)}</b></span>
        </div>
        <div className="settlement-modal-footer">
          <small>Your dashboard stays locked until playback ends.</small>
          <button ref={skip} className="secondary" onClick={onFinish}>Skip Animation</button>
        </div>
      </section>
    </div>, document.body
  );
}
