import { useEffect, useRef, useState } from "react";
import {
  enqueueAdd,
  enqueueFetch,
  enqueueReorder,
  enqueueSelect,
  enqueueUnselect,
  startQueue,
  subscribe,
} from "./queue.js";

function PaneList({
  items,
  pending,
  hasMore,
  emptyText,
  onScrollEnd,
  onItemClick,
  onRemove,
  onReorder,
  draggable,
}) {
  const dragId = useRef(null);
  const listRef = useRef(null);
  const moreRef = useRef(null);

  function handleScroll(e) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      onScrollEnd();
    }
  }

  useEffect(() => {
    const list = listRef.current;
    const more = moreRef.current;
    if (!list || !more || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onScrollEnd();
      },
      { root: list, rootMargin: "80px" }
    );
    io.observe(more);
    return () => io.disconnect();
  }, [hasMore, items.length, onScrollEnd]);

  function handleDropOnItem(targetId) {
    const id = dragId.current;
    dragId.current = null;
    if (id == null || id === targetId) return;
    onReorder({ id, beforeId: targetId });
  }

  function handleDropAtEnd() {
    const id = dragId.current;
    dragId.current = null;
    if (id == null) return;
    const last = items[items.length - 1];
    if (last == null || last === id) return;
    onReorder({ id, afterId: last });
  }

  return (
    <div className="list" ref={listRef} onScroll={handleScroll}>
      {pending.map((id) => (
        <div key={`p-${id}`} className="row pending">
          {id}
          <span className="tag">очередь</span>
        </div>
      ))}
      {items.map((id) => (
        <div
          key={id}
          className={`row ${draggable ? "drag" : "clickable"}`}
          draggable={Boolean(draggable)}
          onDragStart={(e) => {
            dragId.current = id;
            e.dataTransfer.setData("text/plain", String(id));
          }}
          onDragOver={(e) => {
            if (draggable) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!draggable) return;
            e.preventDefault();
            e.stopPropagation();
            handleDropOnItem(id);
          }}
          onClick={() => onItemClick?.(id)}
        >
          <span>{id}</span>
          {onRemove && (
            <button
              type="button"
              className="icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {draggable && items.length > 0 && (
        <div
          className="drop-end"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleDropAtEnd();
          }}
        />
      )}
      {!items.length && !pending.length && <div className="empty">{emptyText}</div>}
      {hasMore && (
        <div className="more" ref={moreRef}>
          подгрузка по 20…
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [leftQ, setLeftQ] = useState("");
  const [rightQ, setRightQ] = useState("");
  const [left, setLeft] = useState([]);
  const [right, setRight] = useState([]);
  const [leftMore, setLeftMore] = useState(false);
  const [rightMore, setRightMore] = useState(false);
  const [pendingAdds, setPendingAdds] = useState([]);
  const [newId, setNewId] = useState("");
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(false);
  const [status, setStatus] = useState({ adds: 0, changes: 0, fetches: 0 });

  const leftGen = useRef(0);
  const rightGen = useRef(0);
  const leftBusy = useRef(false);
  const rightBusy = useRef(false);
  const knownExtra = useRef(new Set());

  useEffect(() => {
    startQueue();
    return subscribe(setStatus);
  }, []);

  useEffect(() => {
    const gen = ++leftGen.current;
    enqueueFetch("left", leftQ, 0).then((res) => {
      if (gen !== leftGen.current || res.cancelled) return;
      setLeft(res.items || []);
      setLeftMore(Boolean(res.hasMore));
    });
  }, [leftQ]);

  useEffect(() => {
    const gen = ++rightGen.current;
    enqueueFetch("right", rightQ, 0).then((res) => {
      if (gen !== rightGen.current || res.cancelled) return;
      setRight(res.items || []);
      setRightMore(Boolean(res.hasMore));
    });
  }, [rightQ]);

  function loadMore(side) {
    if (side === "left") {
      if (!leftMore || leftBusy.current) return;
      leftBusy.current = true;
      const gen = leftGen.current;
      enqueueFetch("left", leftQ, left.length).then((res) => {
        leftBusy.current = false;
        if (gen !== leftGen.current || res.cancelled) return;
        setLeft((prev) => [...prev, ...(res.items || []).filter((id) => !prev.includes(id))]);
        setLeftMore(Boolean(res.hasMore));
      });
      return;
    }
    if (!rightMore || rightBusy.current) return;
    rightBusy.current = true;
    const gen = rightGen.current;
    enqueueFetch("right", rightQ, right.length).then((res) => {
      rightBusy.current = false;
      if (gen !== rightGen.current || res.cancelled) return;
      setRight((prev) => [...prev, ...(res.items || []).filter((id) => !prev.includes(id))]);
      setRightMore(Boolean(res.hasMore));
    });
  }

  function selectItem(id) {
    setLeft((prev) => prev.filter((x) => x !== id));
    if (!rightQ || String(id).startsWith(rightQ)) {
      setRight((prev) => {
        if (prev.includes(id)) return prev;
        if (rightMore) return prev;
        return [...prev, id];
      });
    }
    enqueueSelect(id);
  }

  function unselectItem(id) {
    setRight((prev) => prev.filter((x) => x !== id));
    setLeft((prev) => {
      if (prev.includes(id)) return prev;
      if (leftQ && !String(id).startsWith(leftQ)) return prev;
      if (leftMore && (prev.length === 0 || id > prev[prev.length - 1])) return prev;
      return [...prev, id].sort((a, b) => a - b);
    });
    enqueueUnselect(id);
  }

  function reorderRight(op) {
    setRight((prev) => {
      const next = prev.filter((x) => x !== op.id);
      if (op.beforeId != null) {
        const idx = next.indexOf(op.beforeId);
        if (idx === -1) next.push(op.id);
        else next.splice(idx, 0, op.id);
      } else if (op.afterId != null) {
        const idx = next.indexOf(op.afterId);
        if (idx === -1) next.push(op.id);
        else next.splice(idx + 1, 0, op.id);
      }
      return next;
    });
    enqueueReorder(op);
  }

  async function onAdd(e) {
    e.preventDefault();
    setMessage("");
    setMessageOk(false);
    const id = Number(newId);
    if (!Number.isSafeInteger(id)) {
      setMessage("ID должен быть целым числом");
      return;
    }
    if ((id >= 1 && id <= 1_000_000) || knownExtra.current.has(id)) {
      setMessage(`ID ${id} уже существует`);
      return;
    }
    if (pendingAdds.includes(id)) {
      setMessage("Этот ID уже в очереди");
      return;
    }
    setPendingAdds((prev) => [...prev, id]);
    setNewId("");
    const result = await enqueueAdd(id);
    setPendingAdds((prev) => prev.filter((x) => x !== id));
    if (result.duplicate) {
      setMessage(`ID ${id} уже существует`);
      return;
    }
    if (!result.ok) {
      setMessage(`Не удалось добавить ${id}`);
      return;
    }
    knownExtra.current.add(id);
    setMessageOk(true);
    setMessage(`ID ${id} добавлен`);
    enqueueFetch("left", leftQ, 0).then((res) => {
      if (res.cancelled) return;
      setLeft(res.items || []);
      setLeftMore(Boolean(res.hasMore));
    });
  }

  const leftPending = pendingAdds.filter((id) => !leftQ || String(id).startsWith(leftQ));

  return (
    <div className="page">
      <header>
        <h1>Список элементов</h1>
        <p className="hint">
          Добавление уходит на сервер раз в 10 секунд, остальное — раз в секунду. Поиск не
          сохраняется.
        </p>
        <p className="queue">
          В очереди: добавлений {status.adds}, изменений {status.changes}, запросов{" "}
          {status.fetches}
        </p>
      </header>

      <div className="panes">
        <section className="pane">
          <h2>Доступные</h2>
          <form className="add" onSubmit={onAdd}>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="Новый ID"
              inputMode="numeric"
            />
            <button type="submit">Добавить</button>
          </form>
          {message && <p className={`msg${messageOk ? " ok" : ""}`}>{message}</p>}
          <input
            className="filter"
            value={leftQ}
            onChange={(e) => setLeftQ(e.target.value.trim())}
            placeholder="Фильтр: ID начинается с…"
          />
          <PaneList
            items={left}
            pending={leftPending}
            hasMore={leftMore}
            emptyText="Нет элементов"
            onScrollEnd={() => loadMore("left")}
            onItemClick={selectItem}
          />
        </section>

        <section className="pane">
          <h2>Выбранные</h2>
          <p className="sub">Перетащите, чтобы изменить порядок. × — убрать.</p>
          <input
            className="filter"
            value={rightQ}
            onChange={(e) => setRightQ(e.target.value.trim())}
            placeholder="Фильтр: ID начинается с…"
          />
          <PaneList
            items={right}
            pending={[]}
            hasMore={rightMore}
            emptyText="Ничего не выбрано"
            draggable
            onScrollEnd={() => loadMore("right")}
            onRemove={unselectItem}
            onReorder={reorderRight}
          />
        </section>
      </div>
    </div>
  );
}
