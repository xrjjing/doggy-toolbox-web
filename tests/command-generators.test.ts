import { describe, expect, it } from 'vitest'
import {
  generateDockerBuildCommand,
  generateDockerComposeCommand,
  generateDockerContainerCommand,
  generateDockerCpCommand,
  generateDockerExecCommand,
  generateDockerImagesCommand,
  generateDockerLogsCommand,
  generateDockerNetworkCommand,
  generateDockerPruneCommand,
  generateDockerPsCommand,
  generateDockerRunCommand,
  generateDockerServiceCreateCommand,
  generateDockerServiceLsCommand,
  generateDockerServiceLogsCommand,
  generateDockerServicePsCommand,
  generateDockerServiceRmCommand,
  generateDockerServiceScaleCommand,
  generateDockerServiceUpdateCommand,
  generateDockerStackDeployCommand,
  generateDockerStackLsCommand,
  generateDockerStackPsCommand,
  generateDockerStackRmCommand,
  generateDockerStackServicesCommand,
  generateDockerSwarmInitCommand,
  generateDockerSwarmJoinCommand,
  generateDockerSwarmLeaveCommand,
  generateDockerSwarmUnlockCommand,
  generateDockerSwarmUpdateCommand,
  generateDockerVolumeCommand,
  generateGitBranchCommand,
  generateGitCherryPickCommand,
  generateGitCloneCommand,
  generateGitCommitCommand,
  generateGitLogCommand,
  generateGitMergeCommand,
  generateGitRebaseCommand,
  generateGitRemoteCommand,
  generateGitResetCommand,
  generateGitRevertCommand,
  generateGitStashCommand,
  generateGitTagCommand,
  generateNginxConfig,
  getDockerCommandTemplates,
  getGitCommandTemplates,
  validateNginxConfig
} from '@renderer/features/tools/utils'

describe('git command generators', () => {
  it('covers commit / branch / log / reset / clone / merge', () => {
    expect(
      generateGitCommitCommand('feat: migrate panels', {
        all: true,
        amend: true,
        noVerify: true
      }).command
    ).toBe("git commit -a --amend --no-verify -m 'feat: migrate panels'")

    expect(
      generateGitBranchCommand('rename', 'feature/old', {
        newName: 'feature/new'
      }).command
    ).toBe('git branch -m feature/old feature/new')

    expect(
      generateGitLogCommand({
        oneline: true,
        graph: true,
        maxCount: 10,
        author: 'xrj',
        grep: 'fix'
      }).command
    ).toBe('git log --oneline --graph -n 10 --author=xrj --grep=fix')

    expect(generateGitResetCommand('hard', 'HEAD~1').warnings[0]).toContain('丢弃')
    expect(
      generateGitCloneCommand('https://github.com/xrj/toolbox.git', {
        branch: 'main',
        depth: 1,
        recursive: true,
        targetDir: 'toolbox'
      }).command
    ).toBe('git clone -b main --depth 1 --recursive https://github.com/xrj/toolbox.git toolbox')

    expect(
      generateGitMergeCommand('feature/command', {
        noFf: true,
        squash: true,
        message: 'merge feature/command'
      }).command
    ).toBe("git merge --no-ff --squash -m 'merge feature/command' feature/command")
  })

  it('covers stash / rebase / cherry-pick / tag / remote / revert / templates', () => {
    expect(
      generateGitStashCommand('save', {
        message: 'WIP: split panels',
        keepIndex: true
      }).command
    ).toBe("git stash push --keep-index -m 'WIP: split panels'")

    expect(
      generateGitRebaseCommand('main', {
        interactive: true,
        onto: 'release/2026.04'
      }).command
    ).toBe('git rebase -i --onto release/2026.04 main')

    expect(
      generateGitCherryPickCommand('abc123 def456', {
        noCommit: true,
        signoff: true,
        mainline: 1
      }).command
    ).toBe('git cherry-pick -n -s -m 1 abc123 def456')

    expect(
      generateGitTagCommand('push', 'v1.2.3', {
        remote: 'origin',
        force: true
      }).command
    ).toBe('git push -f origin v1.2.3')

    expect(
      generateGitRemoteCommand('add', 'origin', 'git@github.com:xrj/toolbox.git').command
    ).toBe('git remote add origin git@github.com:xrj/toolbox.git')

    expect(
      generateGitRevertCommand('abc1234', {
        noCommit: true,
        noEdit: true
      }).command
    ).toBe('git revert -n --no-edit abc1234')

    expect(getGitCommandTemplates().some((item) => item.name === '初始化仓库')).toBe(true)
  })
})

describe('docker command generators', () => {
  it('covers run / build / compose / exec / logs / ps / images', () => {
    expect(
      generateDockerRunCommand('nginx:alpine', {
        name: 'web',
        ports: ['80:80', '443:443'],
        env: ['NODE_ENV=prod'],
        detach: true,
        restart: 'unless-stopped'
      }).command
    ).toBe(
      'docker run -d --name web --restart unless-stopped -p 80:80 -p 443:443 -e NODE_ENV=prod nginx:alpine'
    )

    expect(
      generateDockerBuildCommand('.', {
        tag: 'toolbox:latest',
        file: 'Dockerfile.prod',
        buildArg: ['NODE_ENV=production'],
        noCache: true,
        pull: true
      }).command
    ).toBe(
      'docker build -t toolbox:latest -f Dockerfile.prod --no-cache --pull --rm --build-arg NODE_ENV=production .'
    )

    expect(
      generateDockerComposeCommand('up', {
        file: 'docker-compose.yml',
        projectName: 'toolbox',
        service: ['web', 'worker'],
        detach: true,
        build: true
      }).command
    ).toBe('docker compose -f docker-compose.yml -p toolbox up -d --build web worker')

    expect(
      generateDockerExecCommand('web', '/bin/sh', {
        interactive: true,
        user: 'root'
      }).command
    ).toBe('docker exec -it -u root web /bin/sh')

    expect(
      generateDockerLogsCommand('web', {
        follow: true,
        tail: 100,
        timestamps: true,
        since: '1h'
      }).command
    ).toBe('docker logs -f -t --tail 100 --since 1h web')

    expect(
      generateDockerPsCommand({
        all: true,
        quiet: true,
        filter: 'status=running'
      }).command
    ).toBe('docker ps -a -q --filter status=running')

    expect(
      generateDockerImagesCommand({
        digests: true,
        format: 'table {{.Repository}}'
      }).command
    ).toBe("docker images --digests --format 'table {{.Repository}}'")
  })

  it('covers container / network / volume / prune / cp / templates', () => {
    expect(
      generateDockerContainerCommand('rm', ['web', 'api'], {
        force: true,
        volumes: true
      }).command
    ).toBe('docker rm -f -v web api')

    expect(
      generateDockerNetworkCommand('connect', 'frontend', {
        container: 'web',
        alias: 'app'
      }).command
    ).toBe('docker network connect --alias app frontend web')

    expect(
      generateDockerVolumeCommand('create', 'app-data', {
        driver: 'local',
        label: ['team=dev'],
        opt: ['type=nfs']
      }).command
    ).toBe('docker volume create -d local --label team=dev -o type=nfs app-data')

    expect(
      generateDockerPruneCommand({
        force: true,
        all: true,
        volumes: true,
        filter: 'until=24h'
      }).command
    ).toBe('docker system prune -f -a --volumes --filter until=24h')

    expect(
      generateDockerCpCommand('web:/app/dist', './backup', {
        archive: true,
        followLink: true
      }).command
    ).toBe('docker cp -a -L web:/app/dist ./backup')

    expect(getDockerCommandTemplates().some((item) => item.name === '运行 Nginx')).toBe(true)
  })
})

describe('docker service / swarm generators', () => {
  it('covers docker service create / update / scale / logs / ps / ls / rm', () => {
    expect(
      generateDockerServiceCreateCommand({
        image: 'nginx:latest',
        name: 'web-service',
        replicas: 2,
        publish: ['8080:80'],
        networks: ['frontend'],
        endpointMode: 'vip'
      }).command
    ).toBe(
      'docker service create --name web-service --replicas 2 --publish 8080:80 --network frontend --endpoint-mode vip nginx:latest'
    )

    expect(
      generateDockerServiceUpdateCommand('web-service', {
        image: 'nginx:1.27',
        replicas: 3,
        publish: ['8443:443']
      }).command
    ).toBe(
      'docker service update --image nginx:1.27 --replicas 3 --publish-add 8443:443 web-service'
    )

    expect(generateDockerServiceScaleCommand('web-service', 4).command).toBe(
      'docker service scale web-service=4'
    )
    expect(
      generateDockerServiceLogsCommand('web-service', {
        follow: true,
        tail: 100
      }).command
    ).toBe('docker service logs --follow --tail 100 web-service')
    expect(generateDockerServicePsCommand('web-service').command).toBe(
      'docker service ps web-service'
    )
    expect(generateDockerServiceLsCommand().command).toBe('docker service ls')
    expect(generateDockerServiceRmCommand(['web-service', 'worker-service']).command).toBe(
      'docker service rm web-service worker-service'
    )
  })

  it('covers swarm init / join / leave / update / unlock and stack deploy / ls / ps / services / rm', () => {
    expect(
      generateDockerSwarmInitCommand({
        advertiseAddr: '192.168.1.10',
        listenAddr: '0.0.0.0:2377',
        forceNewCluster: true
      }).command
    ).toBe(
      'docker swarm init --advertise-addr 192.168.1.10 --listen-addr 0.0.0.0:2377 --force-new-cluster'
    )

    expect(
      generateDockerSwarmJoinCommand('192.168.1.10:2377', {
        token: 'SWMTKN-123',
        advertiseAddr: '192.168.1.11'
      }).command
    ).toBe('docker swarm join --token SWMTKN-123 --advertise-addr 192.168.1.11 192.168.1.10:2377')

    expect(generateDockerSwarmLeaveCommand({ force: true }).command).toBe(
      'docker swarm leave --force'
    )
    expect(
      generateDockerSwarmUpdateCommand({
        autolock: true,
        certExpiry: '2160h',
        dispatcherHeartbeat: '5s'
      }).command
    ).toBe('docker swarm update --autolock=true --cert-expiry 2160h --dispatcher-heartbeat 5s')
    expect(generateDockerSwarmUnlockCommand().command).toBe('docker swarm unlock')

    expect(
      generateDockerStackDeployCommand('toolbox', {
        composeFiles: ['docker-compose.yml', 'docker-compose.prod.yml'],
        withRegistryAuth: true,
        prune: true,
        resolveImage: 'changed'
      }).command
    ).toBe(
      'docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml --with-registry-auth --prune --resolve-image changed toolbox'
    )
    expect(generateDockerStackLsCommand().command).toBe('docker stack ls')
    expect(generateDockerStackPsCommand('toolbox').command).toBe('docker stack ps toolbox')
    expect(generateDockerStackServicesCommand('toolbox').command).toBe(
      'docker stack services toolbox'
    )
    expect(generateDockerStackRmCommand(['toolbox', 'monitoring']).command).toBe(
      'docker stack rm toolbox monitoring'
    )
  })
})

describe('nginx config generator', () => {
  it('covers reverse proxy / static site / spa / ssl / load balance', () => {
    const reverseProxy = generateNginxConfig('reverseProxy', {
      serverName: 'api.example.com',
      listenPort: '8080',
      proxyPass: 'http://127.0.0.1:9000',
      proxyTimeout: '30',
      websocket: 'true'
    })
    expect(reverseProxy.config).toContain('proxy_pass http://127.0.0.1:9000;')
    expect(reverseProxy.config).toContain('proxy_set_header Upgrade $http_upgrade;')

    const staticSite = generateNginxConfig('staticSite', {
      serverName: 'static.example.com',
      listenPort: '80',
      rootPath: '/srv/www',
      indexFile: 'index.html',
      gzip: 'true',
      cacheControl: 'true'
    })
    expect(staticSite.config).toContain('root /srv/www;')
    expect(staticSite.config).toContain('expires 30d;')

    expect(
      generateNginxConfig('spa', {
        serverName: 'spa.example.com',
        listenPort: '80',
        rootPath: '/srv/spa'
      }).config
    ).toContain('try_files $uri $uri/ /index.html;')

    expect(
      generateNginxConfig('ssl', {
        serverName: 'secure.example.com',
        listenPort: '443',
        sslCert: '/etc/nginx/cert.pem',
        sslKey: '/etc/nginx/key.pem',
        rootPath: '/srv/ssl',
        hsts: 'true'
      }).config
    ).toContain('listen 443 ssl http2;')

    expect(
      generateNginxConfig('loadBalance', {
        serverName: 'lb.example.com',
        listenPort: '80',
        upstreamName: 'backend',
        servers: '10.0.0.1:8080,10.0.0.2:8080',
        algorithm: 'least_conn'
      }).config
    ).toContain('least_conn;')
  })

  it('covers rate limit / cors / file upload and validation', () => {
    expect(
      generateNginxConfig('rateLimit', {
        serverName: 'api.example.com',
        listenPort: '80',
        zoneName: 'api_limit',
        rateLimit: '15',
        burstLimit: '30'
      }).config
    ).toContain('limit_req_zone $binary_remote_addr zone=api_limit:10m rate=15r/s;')

    expect(
      generateNginxConfig('cors', {
        serverName: 'cors.example.com',
        listenPort: '80',
        allowOrigin: 'https://app.example.com',
        allowMethods: 'GET, POST'
      }).config
    ).toContain('Access-Control-Allow-Origin "https://app.example.com"')

    expect(
      generateNginxConfig('fileUpload', {
        serverName: 'upload.example.com',
        listenPort: '80',
        maxBodySize: '256',
        uploadPath: '/files'
      }).config
    ).toContain('client_max_body_size 256m;')

    const invalid = generateNginxConfig('reverseProxy', {
      serverName: 'api.example.com',
      listenPort: '99999',
      proxyPass: 'http://127.0.0.1:8080',
      proxyTimeout: '30',
      websocket: 'false'
    })
    expect(invalid.error).toContain('监听端口')

    expect(validateNginxConfig('server {').some((item) => item.includes('花括号'))).toBe(true)
  })
})
