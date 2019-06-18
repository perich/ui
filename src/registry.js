import {
  getENS,
  getNamehash,
  getLabelHash,
  getENSEvent,
  getReverseRegistrarContract,
  getResolverContract,
  getTestRegistrarContract,
  getNamehashWithLabelHash,
  normalize
} from './ens'
import { decryptHashes } from './preimage'
import {
  uniq,
  ensStartBlock,
  checkLabels,
  mergeLabels,
  isDecrypted,
  encodeLabelHash
} from './utils/utils'
import { getWeb3, getAccount, getSigner } from './web3'
import { utils } from 'ethers'

export async function getOwner(name) {
  const { ENS } = await getENS()
  const namehash = getNamehash(name)
  const owner = await ENS.owner(namehash)
  return owner
}

export async function getResolver(name) {
  const namehash = getNamehash(name)
  const { ENS } = await getENS()
  return ENS.resolver(namehash)
}

export async function getResolverWithLabelHash(labelHash, nodeHash) {
  let { ENS } = await getENS()
  const namehash = await getNamehashWithLabelHash(labelHash, nodeHash)
  return ENS.resolver(namehash)
}

export async function getOwnerWithLabelHash(labelHash, nodeHash) {
  let { ENS } = await getENS()
  const namehash = await getNamehashWithLabelHash(labelHash, nodeHash)
  return ENS.owner(namehash)
}

export async function registerTestdomain(label) {
  const { registrar } = await getTestRegistrarContract()
  const namehash = await utils.keccak256(label)
  const account = await getAccount()
  return registrar.register(namehash, account)
}

export async function expiryTimes(label, owner) {
  const { registrar } = await getTestRegistrarContract()
  const namehash = await utils.keccak256(label)
  const result = await registrar.expiryTimes(namehash).call()
  if (result > 0) {
    return new Date(result * 1000)
  }
}

export async function getAddr(name) {
  const resolverAddr = await getResolver(name)
  if (parseInt(resolverAddr, 16) === 0) {
    return '0x00000000000000000000000000000000'
  }
  const namehash = getNamehash(name)
  try {
    const { Resolver } = await getResolverContract(resolverAddr)
    const addr = await Resolver.addr(namehash)
    return addr
  } catch (e) {
    console.warn(
      'Error getting addr on the resolver contract, are you sure the resolver address is a resolver contract?'
    )
    return '0x00000000000000000000000000000000'
  }
}

export async function getContent(name) {
  const resolverAddr = await getResolver(name)
  if (parseInt(resolverAddr, 16) === 0) {
    return '0x00000000000000000000000000000000'
  }
  try {
    const namehash = getNamehash(name)
    const { Resolver } = await getResolverContract(resolverAddr)
    const contentHashSignature = utils
      .solidityKeccak256(['string'], ['contenthash(bytes32)'])
      .slice(0, 10)

    const isContentHashSupported = await Resolver.supportsInterface(
      contentHashSignature
    )

    if (isContentHashSupported) {
      return {
        value: await Resolver.contenthash(namehash),
        contentType: 'contenthash'
      }
    } else {
      const value = await Resolver.content(namehash)
      return {
        value,
        contentType: 'oldcontent'
      }
    }
  } catch (e) {
    const message =
      'Error getting content on the resolver contract, are you sure the resolver address is a resolver contract?'
    console.warn(message, e)
    return { value: message, contentType: 'error' }
  }
}

export async function getName(address) {
  const reverseNode = `${address.slice(2)}.addr.reverse`
  const reverseNamehash = getNamehash(reverseNode)
  const resolverAddr = await getResolver(reverseNode)
  if (parseInt(resolverAddr, 16) === 0) {
    return {
      name: null
    }
  }

  try {
    const { Resolver } = await getResolverContract(resolverAddr)
    const name = await Resolver.name(reverseNamehash)
    return {
      name
    }
  } catch (e) {
    console.log(`Error getting name for reverse record of ${address}`, e)
  }
}

export async function setOwner(name, newOwner) {
  const { ENS } = await getENS()
  const namehash = getNamehash(name)
  return ENS.setOwner(namehash, newOwner)
}

export async function setSubnodeOwner(unnormalizedLabel, node, newOwner) {
  const { ENS } = await getENS()
  const label = normalize(unnormalizedLabel)
  const labelHash = getLabelHash(label)
  const parentNamehash = getNamehash(node)
  return ENS.setSubnodeOwner(parentNamehash, labelHash, newOwner)
}

export async function setResolver(name, resolver) {
  const namehash = getNamehash(name)
  const { ENS } = await getENS()
  return ENS.setResolver(namehash, resolver)
}

export async function setAddress(name, address) {
  const namehash = getNamehash(name)
  const resolverAddr = await getResolver(name)
  const { Resolver } = await getResolverContract(resolverAddr)
  return Resolver.setAddr(namehash, address)
}

export async function setContent(name, content) {
  const namehash = getNamehash(name)
  const resolverAddr = await getResolver(name)
  const { Resolver } = await getResolverContract(resolverAddr)
  return Resolver.setContent(namehash, content)
}

export async function setContenthash(name, content) {
  const namehash = getNamehash(name)
  const resolverAddr = await getResolver(name)
  const { Resolver } = await getResolverContract(resolverAddr)
  return Resolver.setContenthash(namehash, content)
}

export async function checkSubDomain(subDomain, domain) {
  const { ENS } = await getENS()
  return ENS.owner(subDomain + '.' + domain).call()
}

export async function buildSubDomain(label, node, owner) {
  const labelHash = getLabelHash(label)
  const resolver = await getResolver(label + '.' + node)
  const subDomain = {
    resolver,
    labelHash,
    owner,
    label,
    node,
    name: label + '.' + node
  }

  if (parseInt(resolver, 16) === 0) {
    return subDomain
  } else {
    const resolverAndNode = await getResolverDetails(subDomain)
    return resolverAndNode
  }
}

export async function createSubdomain(subdomain, domain) {
  const account = await getAccount()
  try {
    return setSubnodeOwner(subdomain, domain, account)
  } catch (e) {
    console.log('error creating subdomain', e)
  }
}

export async function deleteSubdomain(subdomain, domain) {
  const name = subdomain + '.' + domain
  const resolver = await getResolver(name)
  const account = await getAccount()
  if (parseInt(resolver, 16) !== 0) {
    const tx = await setSubnodeOwner(subdomain, domain, account)
    tx.wait()
    const tx2 = await setResolver(name, 0)
    tx2.wait()
  }
  try {
    return setSubnodeOwner(
      subdomain,
      domain,
      '0x0000000000000000000000000000000000000000'
    )
  } catch (e) {
    console.log('error deleting subdomain', e)
  }
}

export async function getResolverDetails(node) {
  try {
    const addrPromise = getAddr(node.name)
    const contentPromise = getContent(node.name)
    const [addr, content] = await Promise.all([addrPromise, contentPromise])
    return {
      ...node,
      addr,
      content: content.value,
      contentType: content.contentType
    }
  } catch (e) {
    return {
      ...node,
      addr: '0x0',
      content: '0x0',
      contentType: 'error'
    }
  }
}

export async function claimAndSetReverseRecordName(name, gas) {
  const { reverseRegistrar } = await getReverseRegistrarContract()
  if (gas) {
    return reverseRegistrar.setName(name)
  } else {
    return reverseRegistrar.setName(name)
  }
}

export async function setReverseRecordName(name) {
  const account = await getAccount()
  const reverseNode = `${account.slice(2)}.addr.reverse`
  const resolverAddress = await getResolver(reverseNode)
  let { Resolver } = await getResolverContract(resolverAddress)
  let namehash = getNamehash(reverseNode)
  return Resolver.setName(namehash, name)
}

export async function getDomainDetails(name) {
  const nameArray = name.split('.')
  const labelHash = getLabelHash(nameArray[0])
  const [owner, resolver] = await Promise.all([
    getOwner(name),
    getResolver(name)
  ])
  const node = {
    name,
    label: nameArray[0],
    labelHash,
    owner,
    resolver,
    subDomains: []
  }

  const hasResolver = parseInt(node.resolver, 16) !== 0

  if (hasResolver) {
    return getResolverDetails(node)
  }

  return {
    ...node,
    addr: null,
    content: null
  }
}

export const getSubDomains = async name => {
  const startBlock = await ensStartBlock()
  const namehash = getNamehash(name)
  const rawLogs = await getENSEvent('NewOwner', {
    topics: [namehash],
    fromBlock: startBlock
  })
  const flattenedLogs = rawLogs.map(log => log.values)
  flattenedLogs.reverse()
  const logs = uniq(flattenedLogs, 'label')
  const labelHashes = logs.map(log => log.label)
  const remoteLabels = await decryptHashes(...labelHashes)
  const localLabels = checkLabels(...labelHashes)
  const labels = mergeLabels(localLabels, remoteLabels)
  const ownerPromises = labels.map(label => getOwner(`${label}.${name}`))

  return Promise.all(ownerPromises).then(owners =>
    owners.map((owner, index) => {
      return {
        label: labels[index],
        labelHash: logs[index].label,
        decrypted: labels[index] !== null,
        node: name,
        name: `${labels[index] || encodeLabelHash(logs[index].label)}.${name}`,
        owner
      }
    })
  )
}
