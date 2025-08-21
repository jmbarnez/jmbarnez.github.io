# Sandbox Idle Game Project

## Overview

Sandbox Idle is a multiplayer browser-based idle game built with modern web technologies. The game features real-time multiplayer functionality, persistent player data, and a pixel-art aesthetic with smooth gameplay mechanics.

## Project Goals

### Core Objectives
- **Multiplayer Experience**: Real-time player interaction in a shared world
- **Persistent Progress**: Player data stored securely in Firebase
- **Scalable Architecture**: Clean separation between client and server logic
- **Modern Development**: Using cutting-edge web technologies and best practices

### Technical Goals
- **Performance**: Smooth 60fps gameplay with efficient rendering
- **Security**: Secure authentication and data validation
- **Maintainability**: Well-documented, modular codebase
- **Deployment**: Automated CI/CD with reliable hosting

## Architecture

### Tech Stack
- **Frontend**: HTML5 Canvas, JavaScript (ES6+), Vite
- **Backend**: Node.js, Express, WebSocket
- **Database**: Firebase Realtime Database, Firestore
- **Authentication**: Firebase Auth
- **Hosting**: Firebase Hosting (client), Render (server)
- **CI/CD**: GitHub Actions

### System Components

#### Client-Side (`src/`)
- **Game Engine** (`src/game/`): Core gameplay logic, rendering, physics
- **UI System** (`src/ui/`): User interface components and panels
- **Services** (`src/services/`): Firebase integration, data management
- **Utils** (`src/utils/`): Shared utilities and constants

#### Server-Side (`server/`)
- **WebSocket Server**: Real-time game state synchronization
- **Enemy Management**: AI enemy spawning and movement
- **Firebase Integration**: Server-side database operations

## Setup Instructions

### Prerequisites
- Node.js 18+
- Firebase project with Realtime Database and Firestore enabled
- GitHub repository for CI/CD

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sandbox-idle
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd server && npm install && cd ..
   ```

3. **Firebase Setup**
   - Create a Firebase project
   - Enable Realtime Database and Firestore
   - Generate a service account key (download `google-credentials.json`)
   - Place the credentials file in `server/google-credentials.json`

4. **Environment Configuration**
   - Copy `.env.example` to `.env`
   - Configure Firebase settings

5. **Start Development Servers**
   ```bash
   # Client (port 5173)
   npm run dev

   # Server (port 8081)
   cd server && npm start
   ```

### Production Deployment

#### Client Deployment (Firebase Hosting)
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init`
4. Deploy: `firebase deploy`

#### Server Deployment (Render)
1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set environment variable: `FIREBASE_SERVICE_ACCOUNT` (Base64 encoded service account JSON)
4. Set build command: `npm install`
5. Set start command: `node server.js`

## Agentic Coding Best Practices

### Code Organization
- **Modular Structure**: Keep files focused on single responsibilities
- **Clear Naming**: Use descriptive, consistent naming conventions
- **Documentation**: Document complex logic and API contracts
- **Separation of Concerns**: UI, game logic, and data access should be separate

### Development Workflow
- **Version Control**: Commit frequently with clear, descriptive messages
- **Code Reviews**: Use pull requests for significant changes
- **Testing**: Write tests for critical functionality
- **Documentation**: Update docs when making architectural changes

### AI-Friendly Practices
- **Clear Context**: Provide comprehensive context in comments and documentation
- **Consistent Patterns**: Use established patterns throughout the codebase
- **Error Handling**: Implement robust error handling with meaningful messages
- **Type Safety**: Use TypeScript for complex systems (future consideration)

### Communication Guidelines
- **Task Breakdown**: Break complex tasks into smaller, manageable steps
- **Progress Updates**: Provide regular updates on task completion
- **Issue Documentation**: Document problems and solutions encountered
- **Knowledge Sharing**: Document learnings and best practices discovered

### Code Quality Standards
- **ESLint Configuration**: Follow established linting rules
- **Prettier Formatting**: Use consistent code formatting
- **Performance**: Optimize for 60fps gameplay and minimal bundle size
- **Accessibility**: Consider accessibility in UI design

### Firebase Best Practices
- **Security Rules**: Implement proper security rules for data access
- **Data Structure**: Design efficient data structures for real-time updates
- **Connection Management**: Handle offline/online states gracefully
- **Rate Limiting**: Implement appropriate rate limiting for database operations

### WebSocket Best Practices
- **Connection Management**: Handle connection drops and reconnections
- **Message Validation**: Validate all incoming messages
- **Efficient Updates**: Send only necessary data updates
- **Error Recovery**: Implement robust error recovery mechanisms

## Development Guidelines

### Adding New Features
1. **Plan**: Document the feature requirements and implementation plan
2. **Implement**: Follow modular architecture patterns
3. **Test**: Test thoroughly in both development and production environments
4. **Document**: Update relevant documentation
5. **Deploy**: Use CI/CD pipeline for deployment

### Code Style
- **JavaScript Standard**: Follow modern JavaScript practices
- **Async/Await**: Prefer async/await over promises for readability
- **Error Handling**: Use try/catch blocks and meaningful error messages
- **Performance**: Profile and optimize performance-critical code

### Git Workflow
- **Main Branch**: Production-ready code
- **Feature Branches**: New features and bug fixes
- **Pull Requests**: Code review process for significant changes
- **Commits**: Atomic commits with clear messages

## Maintenance

### Regular Tasks
- **Dependency Updates**: Keep dependencies updated and secure
- **Performance Monitoring**: Monitor game performance and user experience
- **Database Cleanup**: Regular cleanup of old/unused data
- **Security Audits**: Regular security reviews and updates

### Troubleshooting
- **Logs**: Check server and client logs for errors
- **Performance**: Use browser dev tools to identify bottlenecks
- **Network**: Monitor network requests and WebSocket connections
- **Database**: Monitor Firebase usage and performance

## Contributing

### For AI Agents
- **Context Awareness**: Always consider the broader system context
- **Documentation Review**: Check existing documentation before making changes
- **Testing**: Ensure changes don't break existing functionality
- **Communication**: Provide clear explanations of changes and reasoning

### For Human Developers
- **Code Review**: Review AI-generated code for correctness and style
- **Integration**: Ensure AI changes integrate well with existing systems
- **Documentation**: Help maintain and improve project documentation
- **Feedback**: Provide feedback to improve AI coding effectiveness

## Future Considerations

### Planned Features
- **Mobile Support**: Responsive design for mobile devices
- **Advanced Multiplayer**: More sophisticated multiplayer mechanics
- **Content Expansion**: Additional game content and features
- **Performance Optimization**: Further performance improvements

### Technical Debt
- **TypeScript Migration**: Consider migrating to TypeScript for better type safety
- **Testing Framework**: Implement comprehensive testing suite
- **Code Splitting**: Optimize bundle size and loading performance
- **Caching Strategy**: Implement intelligent caching for game assets

---

*This documentation is maintained by both human developers and AI agents working collaboratively on the Sandbox Idle project.*