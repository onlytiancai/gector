# GitHub Copilot Instructions

## Project Overview
This is a text correction/grammar checking application with a Vue 3 + Vite frontend located in the `app/` directory.

## Project Structure
- `/app/` - Frontend Vue 3 + Vite application
- `/app/src/views/` - Vue components and pages
- `/app/src/components/` - Reusable Vue components
- Backend API endpoints available at `/api/`


### Code Style
- Use descriptive function and variable names
- Add JSDoc comments for complex functions
- Prefer const/let over var
- Use template literals for string interpolation
- Keep components focused and single-responsibility

### Error Handling
- Add proper error boundaries and logging
- Use console.error for debugging information
- Implement user-friendly error messages
- Handle network failures gracefully

## Common Patterns


### Vue Component Structure
```vue
<template>
  <!-- Clean, semantic HTML -->
</template>

<script setup>
// Imports
// Reactive state
// Functions
// Lifecycle hooks
</script>

<style scoped>
/* Component-specific styles */
</style>
```

### API Integration
```javascript
async function apiCall(data) {
  try {
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return await response.json()
  } catch (error) {
    console.error('API call failed:', error)
    throw error
  }
}
```

## Preferences
- Prioritize code readability and maintainability
- Add comprehensive error handling
- Use semantic HTML and accessible patterns
- Optimize for performance (debouncing, proper cleanup)
- Follow Vue 3 best practices consistently
