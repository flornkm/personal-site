import { QueryClient } from "@tanstack/react-query";

// One client for the whole app, importable outside React: route loaders warm the cache from
// here so a hovered link can have its data ready before the page mounts.
export const queryClient = new QueryClient();
