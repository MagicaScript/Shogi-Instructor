<script setup lang="ts">
// Using script setup for the root, but children use Options API as requested.
import ShogiGame from './components/ShogiGame.vue'
</script>

<template>
  <header>
    <h1>Vue Shogi App</h1>
  </header>

  <main>
    <ShogiGame />
  </main>
</template>

<style scoped>
header {
  text-align: center;
  margin-bottom: 2rem;
}

h1 {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #333;
}

main {
  display: flex;
  justify-content: center;
}
</style>
