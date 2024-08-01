<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="appContainer">
    <header class="grid-area-[header]">
      <!-- <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" /> -->
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
    </header>

    <div class="grid-area-[sidebar]">
      <h1>Sidebar</h1>
    </div>

    <div class="grid-area-[main] overflow-y-auto">
      <RouterView />
    </div>
  </div>
</template>

<style scoped lang="scss">
.appContainer {
  position: relative;
  height: 100vh;
  display: grid;

  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'header header'
    'sidebar main';
}
</style>
