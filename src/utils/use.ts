import { onMounted, onBeforeUnmount, unref } from "vue";
import type { Ref } from "vue";
import type { EventMap } from "@/constant";

function useEvent<T extends keyof EventMap>(
    elRef: Ref<EventTarget | null> | EventTarget,
    type: T,
    listener: (ev: EventMap[T]) => void
) {
    const eventListener: EventListener = (event) => listener(event as EventMap[T]);

    onMounted(() => {
        unref(elRef)?.addEventListener(type, eventListener);
    });
    onBeforeUnmount(() => {
        unref(elRef)?.removeEventListener(type, eventListener);
    });
}

export { useEvent };
