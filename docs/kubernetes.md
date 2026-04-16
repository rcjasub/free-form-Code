# Kubernetes

## The problem

Docker Compose runs all containers on a single machine. If that machine goes down, everything goes down with it. If traffic spikes, there is no way to automatically spin up more containers to handle the load. If a container crashes, someone has to manually restart it.

## The solution: Kubernetes

Kubernetes (K8s) is an orchestrator — it runs containers across a cluster of machines and keeps them healthy automatically.

- If a pod crashes, Kubernetes restarts it
- If a server goes down, Kubernetes moves the pods to a healthy server
- If traffic spikes, Kubernetes spins up more pods to handle the load

## How it works

```
Your machine (or cloud servers)
└── Cluster (group of machines Kubernetes manages)
    └── Node (a single machine in the cluster)
        └── Pod (a running container)
```

In production a cluster is multiple cloud servers. Locally, minikube fakes an entire cluster as a single node on your laptop so you can learn without a cloud provider.

## Docker Compose vs Kubernetes

| | Docker Compose | Kubernetes |
|---|---|---|
| Runs on | One machine | Many machines |
| If machine dies | Everything dies | Pods move to healthy node |
| Scaling | Manual | Automatic |
| Self-healing | No | Yes — restarts crashed pods |
| Config | One `docker-compose.yml` | Separate `.yaml` files per resource |

## Building blocks

### Pod
The smallest unit in Kubernetes — one running container. Equivalent to a running Docker container.

### Deployment
Tells Kubernetes to run X copies (replicas) of a pod and keep them running. If a pod dies, the Deployment notices and starts a new one.

```yaml
spec:
  replicas: 3   # always keep 3 pods running
```

### Service
Gives a pod a stable internal hostname so other pods can reach it. Without a Service, pods get random IPs that change every restart.

```
# Without a Service — unstable
backend tries to reach postgres at 10.0.0.4 ... but after a restart it's 10.0.0.9

# With a Service — stable
backend always reaches postgres at "postgres:5432"
```

This is the same role the service name plays in `docker-compose.yml`.

### ConfigMap
Holds non-sensitive environment variables that get injected into pods at runtime.

```yaml
data:
  DB_HOST: postgres
  PORT: "4000"
```

### Secret
Holds sensitive environment variables. Values are base64 encoded (not encrypted — for real encryption use a secrets manager like AWS Secrets Manager or Vault).

```yaml
data:
  JWT_SECRET: Y2hhbmdlbWU=   # "changeme" base64 encoded
```

### PersistentVolumeClaim (PVC)
Reserves disk storage for a pod. Required for databases — without it, all data is lost when the pod restarts.

In Docker Compose volumes were implicit. In Kubernetes you explicitly request storage and mount it.

```
PersistentVolumeClaim → requests 1Gi of storage
Deployment → mounts that storage at /var/lib/postgresql/data
```

### Ingress
Routes external traffic into the cluster. Equivalent to the nginx reverse proxy in `docker-compose.yml` — it directs `/api` and `/socket.io` requests to the backend and everything else to the frontend.

## File structure

Instead of one `docker-compose.yml`, Kubernetes uses separate files per resource:

```
k8s/
├── postgres.yaml     # PVC + Deployment + Service for postgres
├── redis.yaml        # Deployment + Service for redis
├── configmap.yaml    # Non-sensitive env vars for the backend
├── secret.yaml       # Sensitive env vars (passwords, JWT secret)
├── backend.yaml      # Deployment + Service for the Node API
└── frontend.yaml     # Deployment + Service + Ingress for nginx
```

## Images

Kubernetes runs containers from Docker images — the same images built by the Dockerfiles in this repo. In production, images are pushed to a registry (Docker Hub, AWS ECR, etc.) and Kubernetes pulls them from there.

Locally with minikube, images are built directly into minikube's internal Docker so the cluster can access them without a registry:

```bash
eval $(minikube docker-env)          # point Docker CLI at minikube's internal Docker
docker build -t free-form-backend ./backend   # build image into minikube
```

## First-time database setup

The postgres pod starts empty — the schema must be applied manually on first run:

```bash
# copy the schema file into the pod
kubectl cp backend/db/schema.sql $(kubectl get pod -l app=postgres -o name | sed 's/pod\///'):/schema.sql

# run it against the database
kubectl exec -it $(kubectl get pod -l app=postgres -o name) -- psql -U postgres -d freeformcode -f /schema.sql
```

This only needs to be done once. Data persists across pod restarts via the PersistentVolumeClaim, but is lost if the PVC is deleted.

## Trust proxy

The backend runs behind the Kubernetes Ingress which adds an `X-Forwarded-For` header to every request. Express must be told to trust this header, otherwise `express-rate-limit` will throw a validation error:

```ts
app.set("trust proxy", 1);
```

Without this, rate limiting and IP-based features will not work correctly behind any reverse proxy (Ingress, nginx, load balancer).

## Applying config

```bash
kubectl apply -f k8s/postgres.yaml   # apply a single file
kubectl apply -f k8s/              # apply all files in the folder
```

## Useful commands

```bash
kubectl get pods                     # list running pods
kubectl get services                 # list services
kubectl logs <pod-name>              # view logs from a pod
kubectl describe pod <pod-name>      # detailed info about a pod
kubectl exec -it <pod-name> -- sh    # open a shell inside a pod
minikube start --driver=docker       # start the local cluster
minikube stop                        # stop the local cluster
```
